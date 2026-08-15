# ClasesDe10 Android

La app Android se empaqueta como Trusted Web Activity (TWA). Es la opcion mas limpia para este proyecto porque abre la PWA real de `clasesde10.com` como app Android verificada, mantiene las actualizaciones en la web y evita duplicar paneles en un WebView.

## Que se construye

- `app-release-signed.apk`: instalacion directa en Android.
- `app-release-bundle.aab`: formato para Play Console si mas adelante se decide publicar.
- `assetlinks.json`: archivo que debe quedar publicado en `https://clasesde10.com/.well-known/assetlinks.json` para que Android/Chrome verifiquen que la app pertenece al dominio y no aparezca barra de navegador.

## Build automatico gratis

El workflow manual `.github/workflows/android-twa.yml` prepara Java, Android SDK y Bubblewrap en GitHub Actions sin coste de infraestructura.

Si existen estos secretos, genera una build de release estable:

- `ANDROID_KEYSTORE_BASE64`: keystore Android en base64.
- `ANDROID_KEYSTORE_PASSWORD`: contrasena del keystore.
- `ANDROID_KEY_PASSWORD`: contrasena de la clave `clasesde10`.

Si esos secretos no existen, el workflow crea una clave temporal y produce un APK de pruebas. Esa build sirve para instalar y revisar la app, pero el `assetlinks.json` generado solo sirve para esa build concreta.

## Crear una firma estable

Con Java instalado:

```powershell
keytool -genkeypair -v -keystore android\twa\signing\clasesde10-release.keystore -alias clasesde10 -keyalg RSA -keysize 2048 -validity 10000 -storetype JKS -dname "CN=ClasesDe10, OU=App, O=ClasesDe10, L=Madrid, ST=Madrid, C=ES"
```

Para subirla como secreto de GitHub:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("android\twa\signing\clasesde10-release.keystore")) | Set-Clipboard
```

El archivo de firma no debe subirse al repositorio. Esta protegido por `.gitignore`.

## Publicar verificacion del dominio

Despues de cada build, descarga el artifact `assetlinks.json` y colocalo en:

```text
.well-known/assetlinks.json
```

Luego despliega hosting. Sin ese archivo, Android puede abrir la app como Custom Tab y mostrar UI de navegador.
