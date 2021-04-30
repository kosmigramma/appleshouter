# 📣 appleshouter
iOS notifications for PWAs and Web apps

Do you have a web app or PWA that uses Web Push Notifications?
You might have figured out that Safari on iOS **STILL** has no support for the Web Push API.

## So what to do now?
You might have considered making a web wrapper around your app **just** to get notifications working on iOS.
Not only do you now have an extra codebase to maintain but your app might also not pass the review to get into the App Store.

## There's an alternative workaround
For a long time Apple Wallet has provided an API to create passes, be it coupons, boarding passes or event tickets.
The great thing about those is that you don't need to pass a review to create them and you can distribute them as files!

### But what does that have got to do with Notifications?
The interesting thing about those passes is that Apple provides a way to send Push Notifications when the passes get updated.
This is done so you can e.g. get notified when your flight gets cancelled/delayed.

### This allows for a workaround for the above problem. What we want to do is this:
- Generate a pass for each of your users
- That pass has a single field that contains your notification text.
- When you want to send a notification to your users you simply update that field and your users receive a push notification!

### Limitations
- The phone doesn't seem to vibrate when it receives wallet notifications.
- There can only be one notification at a time(they don't stack).
- Once clicked, the notification will go to your Pass in the Wallet app instead of your app.

## appleshouter makes this really easy

### Preparation
What you will need:
- An Apple Developer Program account

#### Steps
1. Copy over the default config directory provided in the repo:
```
cp -R data.example data
```

2. Get the Apple Certificates and Pass Type Identifier
You will need to get certificates so you can Generate and sign the passes.
The Passes also need to contain an identifier which you can define in the Apple Dev Console.

We will need two files: signerCert.pem (Certificate) and signerKey.pem (Key)

Follow the guide here to get those (Note: we don't need the AppleWWDRCA cert as that's provided in this repo):

https://github.com/alexandercerutti/passkit-generator/blob/master/non-macOS-steps.md#non-macos-steps

Once you've gotten those two files, place them into the data/certs/ directory.
Also keep that Identifier handy because we will need that later.

**Important!**

they need to be called exactly those filenames: **_signerCert.pem_** and **_SignerKey.pem_** otherwise our script won't find them.

3. Get an iOS APNs Auth Key
You will need to get an Auth key to send Push notifications.
Follow the guide here https://developer.clevertap.com/docs/how-to-create-an-ios-apns-auth-key
Download the key and save it as **_authkey.p8_** under data/certs, again important that the file is called exactly that!
Also keep the Key ID handy for the next step.

4. The config.json file
Under data/config.json lies the config file. All the fields below are required.
```
  "SECRET": "This should be a random secret string that you choose/generate yourself.",
  "appleCredentials": {
    "APPLE_AUTH_KEY_ID": "The key ID from step 3",
    "TEAM_IDENTIFIER": "Team ID, you can find it here https://developer.apple.com/account/#/membership/",
    "PASS_TYPE_IDENTIFIER": "The identifier from step 2",
    "SIGNER_KEY_PASSPHRASE": "password for the key generated in step 2, just put null if you didn't choose a password"
  }
```
5. Run the server
```
npm install
npm start
```
Server should be running under port 5000 by default.
You should run it under a reverse proxy such as Caddy(recommend) or nginx.

6. Usage

1. Downloading the Pass
You will first need to generate a URL using the secret you chose in the settings.

This should be called by your backend as we don't want your users to know your precious secret!

```
> curl https://your.host/api/passUrl/SOME_USER_ID  -H 'authorization: Token YOUR_SECRET_TOKEN'
{"url": "https://your.host/pass/918d8d64cfa50224634e9bb3d4c9f0fbb76005c4aab1239cb834d5f9151684ba0a21db24498cacef4fe7a405336e2.pkpass"}
```
You can then pass the URL returned over to the user pertaining to the USER_ID

2. Sending notifications to the Pass

Again this should be done by your backend.

```
> curl --header "Content-Type: application/json" --request POST --data '{"text":"hello world"}' https://your.host/api/sendNotification/SOME_USER_ID -H 'authorization: Token YOUR_SECRET_TOKEN'
{"success":true"}
```

### Customizing the Pass
You can change the icon under data/ as well as the color parameters in the config.json
