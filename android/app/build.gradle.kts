plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

@Suppress("UnstableApiUsage")

android {
    namespace = "com.kurajprodaj.trenazher"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.kurajprodaj.trenazher"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            storeFile = file("C:\\Users\\narda\\upload-keystore.jks")
            storePassword = "Vjcrdf77-Vjcrdf77"      // ← твой пароль
            keyAlias = "upload"
            keyPassword = "Vjcrdf77-Vjcrdf77"        // ← твой пароль
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    bundle {
        language {
            enableSplit = false        // Отключаем разделение по языкам (ru, en и т.д.)
        }
        density {
            enableSplit = false        // Отключаем разделение по плотности экрана (xxhdpi и т.д.)
        }
        abi {
            enableSplit = true         // Архитектуры (arm64) лучше оставить включёнными
        }
    }
}

flutter {
    source = "../.."
}