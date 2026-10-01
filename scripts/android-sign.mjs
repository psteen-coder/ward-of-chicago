/**
 * Point the Capacitor release build at a keystore created in CI.
 * Debug builds install, but a release APK needs an explicit signingConfig.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const gradlePath = join(process.cwd(), "android", "app", "build.gradle");
let gradle = readFileSync(gradlePath, "utf8");

if (gradle.includes("signingConfigs")) {
  console.log("[android-sign] signingConfigs already present");
  process.exit(0);
}

const signing = `
    signingConfigs {
        release {
            storeFile file("ward-release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "ward-of-chicago"
            keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "ward"
            keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: "ward-of-chicago"
        }
    }
`;

if (!gradle.includes("buildTypes {")) {
  throw new Error("android/app/build.gradle has no buildTypes block");
}

gradle = gradle.replace("buildTypes {", `${signing}\n    buildTypes {`);

const releaseNeedle = `release {
            minifyEnabled false`;
if (!gradle.includes(releaseNeedle)) {
  throw new Error("android/app/build.gradle release block was not the expected Capacitor template");
}

gradle = gradle.replace(
  releaseNeedle,
  `release {
            signingConfig signingConfigs.release
            minifyEnabled false`,
);

writeFileSync(gradlePath, gradle);
console.log("[android-sign] release builds use android/app/ward-release.keystore");
