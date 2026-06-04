/**
 * Local-only auth/payment shortcuts that must NEVER run in production:
 *   - returning the OTP code in the send response (`devCode`)
 *   - skipping OTP rate limits
 *   - accepting the mock checkout signature (`sig_mock_*`)
 *
 * These are gated by BOTH conditions, so a single misconfiguration can't expose
 * them: the environment must not be production AND an explicit opt-in flag must
 * be set. In production, leave ENABLE_DEV_AUTH_BYPASS unset.
 */
export function isDevAuthBypass(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_AUTH_BYPASS === "1";
}
