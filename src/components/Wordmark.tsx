// Brand wordmark. Two-tone serif lockup: ink "Key" + amber "mano", tightened
// tracking and a hairline accent under the "a"-stem region for a quiet logo
// feel. The name is a constant brand string (never translated).

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={"km-wordmark " + className} aria-label="Keymano">
      Key<span className="km-wordmark-accent">mano</span>
    </span>
  );
}
