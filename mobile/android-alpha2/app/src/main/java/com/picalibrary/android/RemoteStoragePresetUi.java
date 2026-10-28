package com.picalibrary.android;

import android.content.Context;

/**
 * UI-only translations for named WebDAV presets. Stable vendor IDs, URLs,
 * credentials and provider-owned descriptions remain unchanged on disk.
 */
final class RemoteStoragePresetUi {
    static final class Copy {
        final String label,urlHint,usernameHint,passwordHint,note;
        Copy(String label,String urlHint,String usernameHint,String passwordHint,String note){
            this.label=label;this.urlHint=urlHint;this.usernameHint=usernameHint;
            this.passwordHint=passwordHint;this.note=note;
        }
    }

    private RemoteStoragePresetUi(){}

    static Copy forPreset(Context context,RemoteConfigStore.Preset raw){
        String language=LocaleStore.language(context);
        if(LocaleStore.ZH_CN.equals(language))
            return new Copy(raw.label,raw.urlHint,raw.usernameHint,raw.passwordHint,raw.note);
        boolean ja=LocaleStore.JA.equals(language);
        switch(raw.vendor){
            case "generic":
                return ja ? new Copy("標準 WebDAV","https://dav.example.com/path",
                    "WebDAV ユーザー名","WebDAV パスワード / アプリ用パスワード",
                    "一般的な WebDAV サービス用です。HTTPS を推奨します。")
                    : new Copy("Generic WebDAV","https://dav.example.com/path",
                    "WebDAV username","WebDAV password / app password",
                    "For standard WebDAV services. HTTPS is recommended.");
            case "123pan":
                return ja ? new Copy("123Pan","https://webdav.123pan.cn/webdav",
                    "123Pan の外部接続ユーザー名","外部接続用アプリパスワード",
                    "/webdav を使用します。MKCOL の作成問題を避けるため、フラットオブジェクト互換モードを使います。")
                    : new Copy("123Pan","https://webdav.123pan.cn/webdav",
                    "123Pan third-party mount username","Third-party app password",
                    "Uses /webdav and flat-object compatibility to avoid MKCOL directory errors.");
            case "jianguoyun":
                return ja ? new Copy("Nutstore","https://dav.jianguoyun.com/dav",
                    "Nutstore の登録メールアドレス","サードパーティー用アプリパスワード",
                    "Web ログイン用ではなく、Nutstore のアプリ専用パスワードを使用します。")
                    : new Copy("Nutstore","https://dav.jianguoyun.com/dav",
                    "Nutstore account email","Third-party app password",
                    "Use a Nutstore third-party app password, not your web login password.");
            case "pcloud-us":
                return ja ? new Copy("pCloud · US","https://webdav.pcloud.com",
                    "pCloud のメールアドレス","pCloud のパスワード","米国データリージョン専用です。")
                    : new Copy("pCloud · US","https://webdav.pcloud.com",
                    "pCloud account email","pCloud password","US data region only.");
            case "pcloud-eu":
                return ja ? new Copy("pCloud · EU","https://ewebdav.pcloud.com",
                    "pCloud のメールアドレス","pCloud のパスワード",
                    "EU データリージョン専用です。US 用エンドポイントと混同しないでください。")
                    : new Copy("pCloud · EU","https://ewebdav.pcloud.com",
                    "pCloud account email","pCloud password",
                    "EU data region only; do not use the US endpoint.");
            case "koofr":
                return ja ? new Copy("Koofr","https://app.koofr.net/dav/Koofr",
                    "Koofr のメールアドレス","アプリ専用パスワード",
                    "Koofr WebDAV にはアプリ専用パスワードが必要です。")
                    : new Copy("Koofr","https://app.koofr.net/dav/Koofr",
                    "Koofr account email","Application password",
                    "Koofr WebDAV requires an application-specific password.");
            case "yandex":
                return ja ? new Copy("Yandex Disk","https://webdav.yandex.ru",
                    "Yandex ユーザー名","WebDAV アプリ用パスワード",
                    "WebDAV は Yandex 360 のプランによって制限される場合があります。")
                    : new Copy("Yandex Disk","https://webdav.yandex.ru",
                    "Yandex username","WebDAV app password",
                    "WebDAV access may depend on your Yandex 360 plan.");
            case "infinicloud":
                return ja ? new Copy("InfiniCLOUD","My Page に表示される個別 WebDAV URL",
                    "Connection ID","Apps Password",
                    "アカウントごとに接続先が異なる場合があります。My Page の URL を使用してください。")
                    : new Copy("InfiniCLOUD","Copy your personal WebDAV URL from My Page",
                    "Connection ID","Apps Password",
                    "Endpoints can vary per account; use the URL shown in My Page.");
            case "nextcloud":
                return ja ? new Copy("Nextcloud","https://server/nextcloud/remote.php/dav/files/USERNAME",
                    "Nextcloud ユーザー名","アプリ用パスワード",
                    "Nextcloud 設定画面にある WebDAV URL をコピーし、アプリ用パスワードを使ってください。")
                    : new Copy("Nextcloud","https://server/nextcloud/remote.php/dav/files/USERNAME",
                    "Nextcloud username","App password",
                    "Copy the WebDAV URL from Nextcloud settings and use an app password.");
            case "owncloud":
                return ja ? new Copy("ownCloud","https://server/owncloud/remote.php/webdav",
                    "ownCloud ユーザー名","パスワード / アプリ用パスワード",
                    "URL は導入バージョンと設置パスによって異なります。")
                    : new Copy("ownCloud","https://server/owncloud/remote.php/webdav",
                    "ownCloud username","Password / app password",
                    "The URL depends on your deployment version and installation path.");
            case "openlist":
                return ja ? new Copy("OpenList / AList","https://server.example/dav/",
                    "OpenList / AList ユーザー名","OpenList / AList パスワード",
                    "自分で管理するクラウドストレージを WebDAV として公開できます。")
                    : new Copy("OpenList / AList","https://server.example/dav/",
                    "OpenList / AList username","OpenList / AList password",
                    "Exposes user-managed cloud storage such as Google Drive or OneDrive over WebDAV.");
            case "opendrive":
                return ja ? new Copy("OpenDrive","https://webdav.opendrive.com",
                    "OpenDrive ユーザー名","OpenDrive パスワード",
                    "WebDAV の利用可否は契約プランによって異なります。")
                    : new Copy("OpenDrive","https://webdav.opendrive.com",
                    "OpenDrive username","OpenDrive password",
                    "WebDAV availability depends on your account plan.");
            case "synology":
                return ja ? new Copy("Synology WebDAV Server","https://nas.example:5006",
                    "DSM ユーザー名","DSM パスワード",
                    "DSM の WebDAV Server で HTTPS を有効にし、NAS の設定に合ったポートを使ってください。")
                    : new Copy("Synology WebDAV Server","https://nas.example:5006",
                    "DSM username","DSM password",
                    "Enable HTTPS in DSM WebDAV Server; use the port configured on your NAS.");
            default:
                // Unrecognized vendor never changes its persisted identity or settings.
                return new Copy(raw.label,raw.urlHint,raw.usernameHint,raw.passwordHint,raw.note);
        }
    }
}
