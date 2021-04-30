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
The cool thing about those passes is that Apple provides a way to send Push Notifications when the passes get updated.
This is done so you can for example get notified when your flight gets cancelled/postponed.

### This allows for a workaround for the above problem. What we want to do is this:
- Generate a pass for each of your users
- That pass has a single field that contains your notification text.
- When you want to send a notification to your users you simply update that field and your users receive a push notification!

## appleshouter makes this really easy

### Preparation
What you will need:
- An Apple Developer Program account

#### Steps
1. Copy over the default config directory provided in the repo:
```
cp -R data.example data
```

3. Get the Apple Certificates
You will need to get certificates so you can Generate the passes

We will need two files: signerCert.pem (Certificate) and signerKey.pem (Key)

Follow the guide here to get those (Note: we don't need the AppleWWDRCA cert as that's provided in this repo):

https://github.com/alexandercerutti/passkit-generator/blob/master/non-macOS-steps.md#non-macos-steps

Once you've gotten those two files, place them into the data/certs/ directory.

**Important!**

they need to be called exactly those filenames: **_signerCert.pem_** and **_SignerKey.pem_** otherwise it won't work.

4. Get an iOS APNs Auth Key
You will need to get an Auth key to send Push notifications.
Follow the guide here https://developer.clevertap.com/docs/how-to-create-an-ios-apns-auth-key
Download the key and save it as **_authkey.p8_** under data/certs, again important that the file is called that!

5. 
