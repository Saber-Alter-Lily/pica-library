package com.picalibrary.android;

import java.util.Locale;

/** Allowlisted account diagnostics: provider response bodies are classified but never displayed. */
final class PicaAccountErrors {
    static String providerMarker(int status, String responseBody) {
        if(status==429)return "PICA_ACCOUNT_RATE_LIMIT";
        if(status>=500)return "PICA_ACCOUNT_UNAVAILABLE";
        String value=responseBody==null?"":responseBody.toLowerCase(Locale.ROOT);
        boolean username=containsAny(value,"email","username","user name","account");
        boolean invalid=containsAny(value,"validation","invalid","format","length","required","missing","must be");
        if(username && containsAny(value,"already","exist","exists","taken","registered","duplicate","duplicated"))return "PICA_ACCOUNT_USERNAME_TAKEN";
        if(containsAny(value,"birthday","birth date","date of birth","age"))return "PICA_ACCOUNT_INVALID_BIRTHDAY";
        if(username && invalid)return "PICA_ACCOUNT_INVALID_USERNAME";
        if(containsAny(value,"password","passwd") && invalid)return "PICA_ACCOUNT_INVALID_PASSWORD";
        if(containsAny(value,"nickname","display name") && invalid)return "PICA_ACCOUNT_INVALID_NICKNAME";
        if(containsAny(value,"question","answer","security","recovery") && invalid)return "PICA_ACCOUNT_INVALID_RECOVERY";
        if(value.contains("1002") || invalid)return "PICA_ACCOUNT_VALIDATION";
        if(status==409)return "PICA_ACCOUNT_USERNAME_TAKEN";
        return "PICA_ACCOUNT_REJECTED";
    }

    static String message(Exception error) {
        if(isNetwork(error))
            return "无法连接 Pica API。注册本身不强制使用代理，但当前网络直连失败；请开启系统代理或加速器后重试。";
        String value=error.getMessage();
        if("PICA_ACCOUNT_USERNAME_TAKEN".equals(value))return "该用户名已被注册。请更换用户名；如果刚刚提交过注册，请先尝试登录确认账号是否已创建。";
        if("PICA_ACCOUNT_INVALID_USERNAME".equals(value))return "用户名未被 Pica 接受。请使用 1–16 位字母、数字、点或下划线。";
        if("PICA_ACCOUNT_INVALID_PASSWORD".equals(value))return "密码未被 Pica 接受。请使用至少 8 个字符的密码。";
        if("PICA_ACCOUNT_INVALID_BIRTHDAY".equals(value))return "出生日期未被 Pica 接受。请使用 YYYY-MM-DD 的有效日期，并确认已年满 18 岁。";
        if("PICA_ACCOUNT_INVALID_NICKNAME".equals(value))return "昵称未被 Pica 接受。请使用 2–50 个字符的昵称。";
        if("PICA_ACCOUNT_INVALID_RECOVERY".equals(value))return "安全问题或答案未被 Pica 接受。请完整填写 3 组安全问题和答案。";
        if("PICA_ACCOUNT_VALIDATION".equals(value))return "Pica 未接受部分注册资料。请检查用户名、昵称、生日、密码和 3 组安全问题/答案。";
        if("PICA_ACCOUNT_RATE_LIMIT".equals(value))return "Pica 请求过于频繁，请稍后再试，不要连续重复提交。";
        if("PICA_ACCOUNT_REJECTED".equals(value))return "Pica 拒绝了账号请求，但未返回可安全识别的具体原因。请检查填写信息后重试。";
        if("PICA_ACCOUNT_UNAVAILABLE".equals(value))return "Pica 账号服务暂时不可用，请稍后再试。";
        if("PICA_ACCOUNT_RESPONSE_INVALID".equals(value))return "Pica 返回了无法识别的账号响应，结果尚未确认。请先尝试登录，不要重复注册。";
        return "账号请求未能确认。请先检查网络；如果刚提交过注册，请先尝试登录，不要立即重复创建。";
    }

    private static boolean isNetwork(Throwable error) {
        for(Throwable current=error;current!=null;current=current.getCause()) {
            if(current instanceof java.net.SocketTimeoutException || current instanceof java.net.ConnectException || current instanceof java.net.UnknownHostException || current instanceof javax.net.ssl.SSLException)return true;
        }
        return false;
    }

    private static boolean containsAny(String value,String... needles) {
        for(String needle:needles)if(value.contains(needle))return true;
        return false;
    }
}
