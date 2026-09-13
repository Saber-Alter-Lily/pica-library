package com.picalibrary.android;

/** Allowlisted account diagnostics. Never surface provider response bodies or headers. */
final class PicaAccountErrors {
    static String message(Exception error) {
        if(isNetwork(error))
            return "无法连接 Pica API。注册本身不强制使用代理，但当前网络直连失败；请开启系统代理或加速器后重试。若请求在提交途中断开，请先尝试登录。";
        String value=error.getMessage();
        if("PICA_ACCOUNT_RATE_LIMIT".equals(value))return "Pica 请求过于频繁，请稍后再试，不要连续重复提交。";
        if("PICA_ACCOUNT_REJECTED".equals(value))return "Pica 已拒绝本次注册请求。请检查用户名、昵称、生日、密码以及 3 组安全问题和答案后重试。";
        if("PICA_ACCOUNT_UNAVAILABLE".equals(value))return "Pica 账号服务暂时不可用，请稍后再试。";
        if("PICA_ACCOUNT_RESPONSE_INVALID".equals(value))return "Pica 返回了无法识别的账号响应，结果尚未确认。请先尝试登录，不要重复注册。";
        return "账号请求未能确认。请先检查网络；如果刚提交过注册，请先尝试登录，不要立即重复创建。";
    }

    static boolean retrySafe(Exception error) {
        if(isNetwork(error))return false;
        String value=error.getMessage();
        return "PICA_ACCOUNT_REJECTED".equals(value)
                || "PICA_ACCOUNT_RATE_LIMIT".equals(value)
                || "PICA_ACCOUNT_UNAVAILABLE".equals(value);
    }

    private static boolean isNetwork(Throwable error) {
        for(Throwable current=error;current!=null;current=current.getCause()) {
            if(current instanceof java.net.SocketTimeoutException || current instanceof java.net.ConnectException || current instanceof java.net.UnknownHostException || current instanceof javax.net.ssl.SSLException)return true;
        }
        return false;
    }
}
