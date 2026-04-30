import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  bodySplitIndex,
  contentType,
  replaceBody,
  stripShebang,
} from "./pad.shebang.tsx"

const BRANCH = "v0-dev"

const publicShebang = `#!/usr/bin/env -S bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/${BRANCH}.tar.gz pad`
const cdn = `https://cdn.jsdelivr.net/gh/subtleGradient/pad@refs/heads/${BRANCH}`
const publicCss = `${cdn}/pad.css`
const publicJs = `${cdn}/pad.browser.js`
const replacementBody = `<pad-document>
  <pad-text>Changed body</pad-text>
</pad-document>`

async function waitForServerUrl(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
  output: {
    stdout: string
    stderr: string
  },
): Promise<string> {
  const decoder = new TextDecoder()
  let resolved = false

  void (async () => {
    const reader = proc.stderr.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      output.stderr += decoder.decode(value)
    }
  })()

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for PAD server URL. stdout=${output.stdout} stderr=${output.stderr}`,
        ),
      )
    }, 5_000)

    void (async () => {
      const reader = proc.stdout.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output.stdout += decoder.decode(value)
        const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+/.exec(
          output.stdout,
        )
        if (match && !resolved) {
          resolved = true
          clearTimeout(timer)
          resolve(match[0])
        }
      }
      if (!resolved) {
        clearTimeout(timer)
        reject(
          new Error(
            `PAD server exited before printing a URL. stdout=${output.stdout} stderr=${output.stderr}`,
          ),
        )
      }
    })().catch((error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function waitForSaved(url: string, bodyHtml: string) {
  const ws = new WebSocket(
    url.replace("http://", "ws://").replace("/?", "/ws?"),
  )
  try {
    await new Promise<true>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for PAD save confirmation."))
      }, 5_000)

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "body", html: bodyHtml }))
      })

      ws.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data))
        if (message.type === "saved") {
          clearTimeout(timer)
          resolve(true)
        }
        if (message.type === "error") {
          clearTimeout(timer)
          reject(new Error(message.message))
        }
      })

      ws.addEventListener("error", () => {
        clearTimeout(timer)
        reject(new Error("PAD WebSocket error."))
      })
    })
  } finally {
    ws.close()
  }
}

describe("stripShebang", () => {
  test("removes only the executable first line", () => {
    const source = `${publicShebang}\n<!doctype html>\n<pad-document></pad-document>\n`

    expect(stripShebang(source)).toBe(
      "<!doctype html>\n<pad-document></pad-document>\n",
    )
  })

  test("leaves non-executable documents unchanged", () => {
    const source = "<!doctype html>\n<pad-document></pad-document>\n"

    expect(stripShebang(source)).toBe(source)
  })
})

describe("replaceBody", () => {
  test("replaces the body after a local browser script", async () => {
    const source = await Bun.file("DEV.pad.htm").text()
    const replaced = replaceBody(source, replacementBody)

    expect(bodySplitIndex(source)).toBeGreaterThan(0)
    expect(replaced).toContain('<link rel="stylesheet" href="./pad.css">')
    expect(replaced).toContain(
      '<script type="module" src="./pad.browser.js"></script>',
    )
    expect(replaced).toContain(replacementBody)
    expect(replaced).not.toContain(
      "local shebang runner and local browser assets",
    )
    expect(replaced.endsWith("\n")).toBe(true)
  })

  test("replaces the body after a jsDelivr browser script", async () => {
    const source = await Bun.file("SPEC.pad.htm").text()
    const replaced = replaceBody(source, replacementBody)

    expect(bodySplitIndex(source)).toBeGreaterThan(0)
    expect(replaced).toContain(publicCss)
    expect(replaced).toContain(publicJs)
    expect(replaced).toContain(replacementBody)
    expect(replaced).not.toContain("first simple PAD demo")
    expect(replaced.endsWith("\n")).toBe(true)
  })

  test("matches browser script URLs with query strings", () => {
    const source = `<!doctype html>
<script type="module" src="/pad.browser.js?cache=1"></script>

<pad-document><pad-text>Old</pad-text></pad-document>
`

    expect(replaceBody(source, replacementBody)).toBe(`<!doctype html>
<script type="module" src="/pad.browser.js?cache=1"></script>

${replacementBody}
`)
  })

  test("throws when the source has no PAD browser script", () => {
    expect(() =>
      replaceBody("<!doctype html>\n<main></main>\n", replacementBody),
    ).toThrow(
      "PAD source must include a pad.browser.js script before the body content.",
    )
  })
})

describe("PAD entry documents", () => {
  test("SPEC pins the GitHub runner and jsDelivr assets to v0-dev", async () => {
    const source = await Bun.file("SPEC.pad.htm").text()

    expect(source.startsWith(`${publicShebang}\n`)).toBe(true)
    expect(source).toContain(publicCss)
    expect(source).toContain(publicJs)
    expect(source).not.toContain("@main")
    expect(source).not.toContain("github:subtleGradient/pad#v0-dev")
  })

  test("DEV uses only local runner and browser assets", async () => {
    const source = await Bun.file("DEV.pad.htm").text()

    expect(source.startsWith("#!/usr/bin/env -S bun ./pad.shebang.tsx\n")).toBe(
      true,
    )
    expect(source).toContain('<link rel="stylesheet" href="./pad.css">')
    expect(source).toContain(
      '<script type="module" src="./pad.browser.js"></script>',
    )
    expect(source).not.toContain("cdn.jsdelivr.net")
  })
})

describe("contentType", () => {
  test("serves known browser asset and HTML types", () => {
    expect(contentType("pad.css")).toBe("text/css; charset=utf-8")
    expect(contentType("pad.browser.js")).toBe("text/javascript; charset=utf-8")
    expect(contentType("SPEC.pad.htm")).toBe("text/html; charset=utf-8")
    expect(contentType("note.txt")).toBe("text/plain; charset=utf-8")
  })
})

describe("trusted local server", () => {
  test("serves a PAD, saves WebSocket body edits, and stops after disconnect", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "pad-test-"))
    const padPath = join(tempRoot, "sample.pad.htm")
    const initialBody = `<pad-document>
  <pad-text>Before save</pad-text>
</pad-document>`
    const changedBody = `<pad-document>
  <pad-text>After save</pad-text>
</pad-document>`
    await Bun.write(
      padPath,
      `#!/usr/bin/env -S bun ./pad.shebang.tsx
<!-- PAD: test fixture. -->
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="./pad.css">
<script type="module" src="./pad.browser.js"></script>

${initialBody}
`,
    )

    const proc = Bun.spawn(["bun", "./pad.shebang.tsx", padPath], {
      env: { ...process.env, PAD_NO_OPEN: "1" },
      stderr: "pipe",
      stdout: "pipe",
    })
    const output = { stdout: "", stderr: "" }

    try {
      const url = await waitForServerUrl(proc, output)
      const response = await fetch(url)
      const served = await response.text()

      expect(response.ok).toBe(true)
      expect(served.startsWith("#!")).toBe(false)
      expect(served).toContain(initialBody)

      await waitForSaved(url, changedBody)

      const saved = await Bun.file(padPath).text()
      expect(saved).toContain(changedBody)
      expect(saved).not.toContain("Before save")

      const exitCode = await Promise.race([
        proc.exited,
        Bun.sleep(5_000).then(() => undefined),
      ])
      expect(exitCode).toBe(0)
    } finally {
      proc.kill()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
