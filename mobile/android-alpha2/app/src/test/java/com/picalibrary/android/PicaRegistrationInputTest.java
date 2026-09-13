package com.picalibrary.android;

import org.junit.Test;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.Assert.*;

public class PicaRegistrationInputTest {
    private Map<String,String> fixture() {
        Map<String,String> input = new LinkedHashMap<>();
        input.put("name", " Demo "); input.put("email", "demo_reader");
        input.put("password", " fixture-password "); input.put("confirmPassword", " fixture-password ");
        input.put("birthday", "2000-02-29"); input.put("gender", "bot");
        for (int i = 1; i <= 3; i++) { input.put("question"+i, " Demo question "); input.put("answer"+i, " answer "); }
        return input;
    }
    @Test public void acceptsUsernameWithoutAtAndPreservesSecrets() {
        Map<String,String> out = PicaRegistrationInput.validate(fixture(), true, LocalDate.of(2026, 9, 13));
        assertEquals("demo_reader", out.get("email"));
        assertEquals("Demo", out.get("name"));
        assertEquals(" fixture-password ", out.get("password"));
        assertEquals(" answer ", out.get("answer1"));
        assertFalse(out.containsKey("confirmPassword"));
        assertEquals(11, out.size());
    }
    @Test public void newUsernameAndPasswordRulesStayConservative() {
        Map<String,String> valid = fixture();
        valid.put("email", "reader.01_"); valid.put("password", "123456789"); valid.put("confirmPassword", "123456789");
        assertEquals("reader.01_", PicaRegistrationInput.validate(valid, true, LocalDate.of(2026,9,13)).get("email"));

        Map<String,String> tooShort = fixture();
        tooShort.put("password", "12345678"); tooShort.put("confirmPassword", "12345678");
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(tooShort, true, LocalDate.of(2026,9,13)));

        Map<String,String> invalidSymbol = fixture();
        invalidSymbol.put("email", "reader-name");
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(invalidSymbol, true, LocalDate.of(2026,9,13)));

        Map<String,String> tooLong = fixture();
        tooLong.put("email", "12345678901234567");
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(tooLong, true, LocalDate.of(2026,9,13)));
    }
    @Test public void rejectsMissingConsent() {
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(fixture(), false, LocalDate.now()));
    }
    @Test public void rejectsMismatchedPasswordWithoutEchoingIt() {
        Map<String,String> input = fixture(); input.put("confirmPassword", "wrong-secret");
        Exception error = assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(input, true, LocalDate.now()));
        assertFalse(error.getMessage().contains("secret"));
    }
    @Test public void leapDayAgeMatchesDesktopMonthDayBoundary() {
        Map<String,String> input = fixture(); input.put("birthday", "2008-02-29");
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(input, true, LocalDate.of(2026, 2, 28)));
        assertEquals("2008-02-29", PicaRegistrationInput.validate(input, true, LocalDate.of(2026, 3, 1)).get("birthday"));
    }
    @Test public void rejectsInvalidDatesAndControlCharacters() {
        Map<String,String> input = fixture(); input.put("birthday", "2001-02-29");
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(input, true, LocalDate.now()));
        input.put("birthday", "2000-02-29"); input.put("answer1", "bad\nanswer");
        assertThrows(IllegalArgumentException.class, () -> PicaRegistrationInput.validate(input, true, LocalDate.now()));
    }
    @Test public void keepsAccountErrorsSafeAndRetryAware() {
        assertFalse(PicaAccountErrors.message(new Exception("token=fixture-sensitive-body")).contains("fixture-sensitive"));
        assertTrue(PicaAccountErrors.message(new java.net.SocketTimeoutException()).contains("直连失败"));
        assertTrue(PicaAccountErrors.message(new Exception("PICA_ACCOUNT_REJECTED")).contains("拒绝"));
        assertFalse(PicaAccountErrors.retrySafe(new java.net.SocketTimeoutException()));
        assertFalse(PicaAccountErrors.retrySafe(new Exception("PICA_ACCOUNT_RESPONSE_INVALID")));
        assertFalse(PicaAccountErrors.retrySafe(new Exception("unknown")));
        assertTrue(PicaAccountErrors.retrySafe(new Exception("PICA_ACCOUNT_REJECTED")));
    }
}
