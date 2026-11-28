import Link from "next/link";
export default function RecoveryPage() {
  return <main className="mx-auto max-w-xl space-y-4 p-6 text-[#293732]">
    <h1 className="text-3xl font-semibold">Recover your account</h1>
    <p>Account recovery currently requires help from the CivicPulse project administrator. Contact the person or institution that provided access and ask them to verify your account ownership.</p>
    <p>Do not share your existing password. After verified recovery, sign in with the temporary password provided privately and choose a new one in Account Security.</p>
    <p>Automated email and OTP recovery are not configured. No reset email has been sent.</p>
    <Link className="inline-block underline" href="/login">Back to sign in</Link>
  </main>;
}
