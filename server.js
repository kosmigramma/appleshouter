const fs = require("fs");
const crypto = require("crypto");

const sqlite3 = require("sqlite3");
const apn = require("@parse/node-apn");
const express = require("express");
const morgan = require("morgan");
const passkit = require("passkit-generator");

const DATA_DIR = "./data";

if (!fs.existsSync(DATA_DIR)) {
    console.error("ERROR: 'data' directory missing!");
    console.log("Run 'cp -R data.example data' to get initial data");
    process.exit(1);
}

const config = require(`${DATA_DIR}/config.json`);

const WWDR_CERTIFICATE_FILE = "./wwdr.pem";
const SIGNER_CERTIFICATE_FILE = `${DATA_DIR}/certs/signerCert.pem`;
const SIGNER_KEY_FILE = `${DATA_DIR}/certs/signerKey.pem`;
const SIGNER_KEY_PASSPHRASE =
    config.appleCredentials.SIGNER_KEY_PASSPHRASE || "N/A";
const AUTH_KEY_PATH = `${DATA_DIR}/certs/authkey.p8`;
const NOTIFICATION_PLACEHOLDER =
    config.style.notificationPlaceholder || "Waiting for notifications...";
const PORT = config.PORT || 5000;
const DB_PATH = `${DATA_DIR}/db.sqlite3`;

[
    SIGNER_CERTIFICATE_FILE,
    SIGNER_KEY_FILE,
    AUTH_KEY_PATH,
].forEach((f) => {
    if (!fs.existsSync(f)) {
        console.error(`ERROR: ${f} is missing`);
        process.exit(1);
    }
});

const AUTH_TOKEN_KEY = fs.readFileSync(SIGNER_KEY_FILE, {encoding: "base64"});

const apnProvider = new apn.Provider({
    production: true,
    token: {
        key: AUTH_KEY_PATH,
        keyId: config.appleCredentials.APPLE_AUTH_KEY_ID,
        teamId: config.appleCredentials.TEAM_IDENTIFIER,
    },
});

const db = new sqlite3.Database(DB_PATH);

// Init database
db.run(`
  CREATE TABLE IF NOT EXISTS notifications (
    user_id TEXT UNIQUE,
    pushToken TEXT,
    text TEXT
  )
`);

function setPushToken(userId, pushToken) {
    db.run(`
        INSERT OR REPLACE INTO notifications (user_id, pushToken)
        VALUES ('${userId}', '${pushToken}');
  `);
}

function setNotificationText(userId, text) {
    db.run(`
        UPDATE notifications
        SET text='${text}'
        WHERE user_id='${userId}';
    `);
}

function removeToken(userId) {
    db.run(`DELETE FROM notifications WHERE user_id='${userId}';`);
}

async function getField(userId, fieldName) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT ${fieldName} FROM notifications WHERE user_id='${userId}'`,
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    if (!rows[0]) reject("NotFound");
                    else resolve(rows[0][fieldName]);
                }
            }
        );
    });
}

const getPushToken = (userId) => getField(userId, "pushToken");

const getNotificationText = (userId) => getField(userId, "text");

const encrypt = (str, key) =>
    ((cipher) => cipher.update(str, "utf8", "hex") + cipher.final("hex"))(
        crypto.createCipher("aes256", key)
    );

const decrypt = (str, key) =>
    ((decipher) => decipher.update(str, "hex", "utf8") + decipher.final("utf8"))(
        crypto.createDecipher("aes256", key)
    );

async function createNotificationPass(urlRoot, userId, notificationText) {
    const passDir = `/tmp/appleshouter-${userId}_PASS.pass`;
    try {
        fs.mkdirSync(passDir, {recursive: true});
        ["icon@2x.png", "icon.png", "logo@2x.png", "logo.png"].forEach((f) =>
            fs.copyFileSync(`${DATA_DIR}/icon.png`, `${passDir}/${f}`)
        );
        fs.writeFileSync(
            `${passDir}/pass.json`,
            JSON.stringify({
                formatVersion: 1,
                webServiceURL: `${urlRoot}/webhooks/wallet/${userId}`,
                authenticationToken: encrypt(userId, AUTH_TOKEN_KEY),
                generic: {
                    secondaryFields: [
                        {
                            key: "last_notification",
                            value: NOTIFICATION_PLACEHOLDER,
                            changeMessage: "%@",
                        },
                    ],
                },
                passTypeIdentifier: config.appleCredentials.PASS_TYPE_IDENTIFIER,
                serialNumber: userId,
                teamIdentifier: config.appleCredentials.TEAM_IDENTIFIER,
                organizationName: config.style.organizationName,
                logoText: config.style.logoText,
                description: config.style.description,
                foregroundColor: config.style.foregroundColor,
                labelColor: config.style.labelColor,
                backgroundColor: config.style.backgroundColor,
            })
        );
        const pass = await passkit.createPass({
            model: passDir,
            certificates: {
                wwdr: WWDR_CERTIFICATE_FILE,
                signerCert: SIGNER_CERTIFICATE_FILE,
                signerKey: {
                    keyFile: SIGNER_KEY_FILE,
                    passphrase: SIGNER_KEY_PASSPHRASE,
                },
            },
        });
        pass.secondaryFields[0].value = notificationText;
        return pass;
    } finally {
        fs.rmSync(passDir, {recursive: true});
    }
}

async function sendNotification(userId, text) {
    const notification = new apn.Notification();
    const pushToken = await getPushToken(userId);
    if (pushToken) {
        setNotificationText(userId, text);
        notification.payload = {};
        notification.topic = config.appleCredentials.PASS_TYPE_IDENTIFIER;
        const result = await apnProvider.send(notification, pushToken);
        if (result.failed.length) {
            const {error, response} = result.failed[0];
            throw error || response;
        }
    } else {
        throw Error("Push token not found");
    }
}

//---- REST API ----

const app = express();
const router = express.Router();

app.use(morgan("tiny"));
app.use(express.json());
app.use("/", router);

function auth(req, res, next) {
    const {authorization} = req.headers;
    const secret = authorization && authorization.split(" ")[1];
    if (secret && secret === config.SECRET) {
        next();
    } else {
        res.sendStatus(401);
    }
}

const getHost = (req) =>
    (req.headers["x-forwarded-proto"] || req.protocol) +
    "://" +
    (req.headers["x-forwarded-host"] || req.headers.host);

router.get("/api/passUrl/:userId", auth, async (req, res) => {
    const {userId} = req.params;
    res.send({
        url: `${getHost(req)}/pass/${encrypt(userId, config.SECRET)}.pkpass`,
    });
});

router.post("/api/sendNotification/:userId", auth, async (req, res) => {
    const {userId} = req.params;
    const {text} = req.body;
    try {
        await sendNotification(userId, text);
        res.send({success: true});
    } catch (e) {
        console.error(e);
        res.status(400).send({success: false, error: e.message || e});
    }
});

router.get("/pass/:encryptedUserId.pkpass", async (req, res) => {
    const {encryptedUserId} = req.params;
    let userId;
    try {
        userId = decrypt(encryptedUserId, config.SECRET);
    } catch (e) {
        res.sendStatus(400);
        throw e;
    }
    const host = getHost(req);
    const pass = await createNotificationPass(
        host,
        userId,
        NOTIFICATION_PLACEHOLDER
    );
    res.setHeader("content-type", "application/octet-stream");
    pass.generate().pipe(res);
});

// Webhooks triggered by Apple Wallet

router.get(
    "/webhooks/wallet/:userId/v1/devices/:deviceId/registrations/:passTypeId",
    (req, res) => {
        const {userId} = req.params;
        res.send({
            serialNumbers: [userId],
            lastUpdated: Math.floor(+new Date() / 1000).toString(),
        });
    }
);

function appleAuth(req, res, next) {
    const {authorization} = req.headers;
    const authenticationToken = authorization && authorization.split(" ")[1];
    if (
        authenticationToken &&
        authenticationToken === encrypt(req.params.userId, AUTH_TOKEN_KEY)
    ) {
        next();
    } else {
        res.sendStatus(401);
    }
}

router.get(
    "/webhooks/wallet/:userId/v1/passes/:passTypeId/:serialNumber",
    appleAuth,
    async (req, res) => {
        const {userId} = req.params;
        const host = getHost(req);
        const text = await getNotificationText(userId);
        const pass = await createNotificationPass(host, userId, text || "...");
        res.setHeader("last-modified", new Date().toUTCString());
        res.setHeader("content-type", "application/octet-stream");
        pass.generate().pipe(res);
    }
);

router.post("/webhooks/wallet/:serialNumber/v1/log", appleAuth, (req, res) => {
    console.error(req.body);
    res.send({});
});

router.post(
    "/webhooks/wallet/:userId/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber",
    appleAuth,
    (req, res) => {
        const {userId} = req.params;
        const {pushToken} = req.body;
        setPushToken(userId, pushToken);
        res.send({});
    }
);

router.delete(
    "/webhooks/wallet/:userId/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber",
    appleAuth,
    (req, res) => {
        const {userId} = req.params;
        removeToken(userId);
        res.send({});
    }
);

router.all("*", (_req, res) => res.sendStatus(404));

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
