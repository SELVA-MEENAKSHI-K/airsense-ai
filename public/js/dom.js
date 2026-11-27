/** Small DOM and number helpers shared by every view module. */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = (selector) => document.querySelector(selector);

/**
 * Create an element with attributes and children.
 * @param {string} tag
 * @param {{class?: string, text?: string, attrs?: Record<string,string>}|null} [props]
 * @param {...(Node|string|null)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = null, ...children) {
  const node = document.createElement(tag);
  if (props) {
    if (props.class) node.className = props.class;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.id) node.id = props.id;
    if (props.type) node.setAttribute('type', props.type);
    if (props.attrs) {
      for (const [name, value] of Object.entries(props.attrs)) node.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

export const number = (value, digits = 0) =>
  Number(value).toLocaleString(document.documentElement.lang === 'ta' ? 'ta-IN' : 'en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
