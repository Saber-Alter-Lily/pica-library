package com.picalibrary.android;

/** Allowlisted UI errors: never surface provider response bodies or headers. */
final class PicaAccountErrors {
    static String message(Exception error) {
        if(error instanceof java.net.SocketTimeoutException || error instanceof java.net.ConnectException || error instanceof java.net.UnknownHostException || error instanceof javax.net.ssl.SSLException)
            return "无法连接 Pica，请检查网络或设备代理，不要反复修改密码。";
        String value=error.getMessage();
        if("PICA_ACCOUNT_RATE_LIMIT".equals(value))return "Pica 请求过于频繁，请稍后再试。";
        if("PICA_ACCOUNT_REJECTED".equals(value))return "Pica 拒绝了账号请求，请检查填写信息或使用 Pica 客户端确认账号状态。";
        if("PICA_ACCOUNT_UNAVAILABLE".equals(value))return "Pica 账号服务暂时不可用。";
        return "账号请求未能确认，请检查网络或稍后再试。";
    }
}
