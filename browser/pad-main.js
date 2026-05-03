// @ts-check

import { registerPadChatElements } from "./chat.js"
import { registerPadCodeEditorElement } from "./codemirror.js"
import { registerPadElements } from "./elements.js"
import { registerOpenCodeChatElements } from "./open-code-chat.js"
import { connect } from "./runtime.js"

registerPadElements()
registerPadCodeEditorElement()
registerPadChatElements()
registerOpenCodeChatElements()

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", connect, { once: true })
} else {
  connect()
}
