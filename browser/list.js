// @ts-check

import { focusEditableEnd } from "./dom.js"
import { applyEditableElementState, canEditNow } from "./editing.js"

/**
 * @template T
 * @param {{
 *   items: T[],
 *   isEmpty: (item: T) => boolean,
 *   appendBlank: () => T,
 *   removeItem: (item: T) => void,
 *   activeItem?: T | null,
 *   focusClearedItem?: T | null,
 * }} options
 * @returns {{ changed: boolean, appendedItem: T | null, removedItems: T[], previousNonEmptyItem: T | null }}
 */
export function normalizeTrailingEmptyItems(options) {
  const { items, isEmpty, appendBlank, removeItem } = options

  if (items.length === 0) {
    return {
      changed: true,
      appendedItem: appendBlank(),
      removedItems: [],
      previousNonEmptyItem: null,
    }
  }

  let lastNonEmptyIndex = -1
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item && !isEmpty(item)) lastNonEmptyIndex = index
  }

  const focusClearedItem = options.focusClearedItem ?? null
  const activeIndex =
    focusClearedItem === null
      ? -1
      : items.findIndex((item) => item === focusClearedItem)
  const shouldMoveFocusToPreviousItem =
    options.activeItem === focusClearedItem &&
    activeIndex > lastNonEmptyIndex &&
    activeIndex >= 0 &&
    lastNonEmptyIndex >= 0 &&
    items[activeIndex] !== undefined &&
    isEmpty(items[activeIndex])
  const previousNonEmptyItem = shouldMoveFocusToPreviousItem
    ? (items[lastNonEmptyIndex] ?? null)
    : null

  const trailingEmptyItems = items.slice(lastNonEmptyIndex + 1)
  const removedItems = trailingEmptyItems.slice(1)
  for (const item of removedItems) removeItem(item)

  const appendedItem = trailingEmptyItems.length === 0 ? appendBlank() : null

  return {
    changed: removedItems.length > 0 || appendedItem !== null,
    appendedItem,
    removedItems,
    previousNonEmptyItem,
  }
}

/** @param {Element} item */
export function markListItemEmptyState(item) {
  item.toggleAttribute("data-pad-empty", item.textContent.trim() === "")
}

/** @param {Element} list */
export function listItems(list) {
  return Array.from(list.children).filter(
    (child) => child.localName === "pad-list-item",
  )
}

/** @returns {HTMLElement} */
export function createListItem() {
  const item = document.createElement("pad-list-item")
  applyEditableElementState(item, canEditNow())
  return item
}

/**
 * @param {Element} list
 * @param {{ focusClearedItem?: Element | null, activeElement?: Element | null }} [options]
 */
export function normalizePadList(list, options = {}) {
  const result = normalizeTrailingEmptyItems({
    items: listItems(list),
    isEmpty: (item) => item.textContent.trim() === "",
    appendBlank: () => {
      const item = createListItem()
      list.append(item)
      return item
    },
    removeItem: (item) => item.remove(),
    activeItem: options.activeElement ?? document.activeElement,
    focusClearedItem: options.focusClearedItem ?? null,
  })

  for (const item of listItems(list)) markListItemEmptyState(item)
  if (result.previousNonEmptyItem) focusEditableEnd(result.previousNonEmptyItem)
  return result
}

export function normalizePadLists() {
  document.querySelectorAll("pad-list:not([data-pad-managed])").forEach((list) =>
    normalizePadList(list),
  )
}

/** @param {Element | null} target */
export function normalizeAfterListInput(target) {
  if (target?.localName !== "pad-list-item") {
    normalizePadLists()
    return
  }

  const list = target.closest("pad-list")
  if (!list || list.hasAttribute("data-pad-managed")) {
    normalizePadLists()
    return
  }

  normalizePadList(list, { focusClearedItem: target })
}
