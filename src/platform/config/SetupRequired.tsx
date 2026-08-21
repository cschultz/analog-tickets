/**
 * Shown when a clone of this platform boots without the public backend
 * configuration it needs. Intentionally dependency-free (no router, no design
 * tokens, no backend client) so it can render before anything else loads.
 *
 * It must never display environment values, project references, or secrets —
 * only the names of the variables that have to be set.
 */

const REQUIRED_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
];

export const SETUP_REQUIRED_HEADING = "Backend configuration required";

export function SetupRequired() {
  return (
    <main
      role="main"
      aria-labelledby="setup-required-heading"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#0b0b0b",
        color: "#f5f5f5",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: 1.6,
      }}
    >
      <div style={{ maxWidth: "40rem" }}>
        <h1 id="setup-required-heading" style={{ fontSize: "1.25rem", margin: "0 0 1rem" }}>
          {SETUP_REQUIRED_HEADING}
        </h1>

        <p style={{ margin: "0 0 1rem" }}>
          This app has no backend configured. It ships with no project reference and no
          credentials, so you need to point it at a backend project you control before it
          can start.
        </p>

        <ol style={{ margin: "0 0 1rem", paddingLeft: "1.25rem" }}>
          <li>Create your own Supabase project (or enable Lovable Cloud).</li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code>.
          </li>
          <li>Fill in the public values below, then restart the dev server.</li>
        </ol>

        <ul style={{ margin: "0 0 1rem", paddingLeft: "1.25rem" }}>
          {REQUIRED_VARS.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>

        <p style={{ margin: 0, opacity: 0.8 }}>
          Full instructions: <code>docs/OPEN_SOURCE_RELEASE_BASELINE.md</code> and{" "}
          <code>docs/SECRETS_SETUP.md</code>. Never put server-side secrets in{" "}
          <code>VITE_*</code> variables — they are compiled into the browser bundle.
        </p>
      </div>
    </main>
  );
}

export default SetupRequired;
