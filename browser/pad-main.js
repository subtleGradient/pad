// @ts-check

import { registerPadElements } from "./elements.js"
import { connect } from "./runtime.js"

registerPadElements()

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", connect, { once: true })
} else {
  connect()
}
