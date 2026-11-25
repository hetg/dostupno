/**
 * Principle 3: fixers change the page ONLY through Dostupno.changes, so that
 * revertAll() can undo everything. This rule flags direct DOM writes in fixers.
 *
 * Allowed exception: the data-dostupno-needs-ai marker, which revertAll()
 * removes by selector.
 */
const MUTATING_METHODS = new Set([
  'setAttribute', 'removeAttribute', 'toggleAttribute', 'setAttributeNS', 'removeAttributeNS',
  'appendChild', 'append', 'prepend', 'insertBefore', 'insertAdjacentHTML', 'insertAdjacentElement',
  'insertAdjacentText', 'replaceChild', 'replaceChildren', 'replaceWith', 'removeChild', 'remove',
  'before', 'after', 'setProperty', 'removeProperty',
]);
const MUTATING_PROPS = new Set([
  'textContent', 'innerHTML', 'outerHTML', 'innerText', 'className', 'id', 'alt', 'title',
  'value', 'hidden', 'lang', 'src', 'href', 'cssText', 'nodeValue',
]);
const ALLOWED_ATTRS = new Set(['data-dostupno-needs-ai']);

const propName = (node) => (node.computed ? null : node.property.name);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Fixers must change the DOM only via Dostupno.changes (reversibility).' },
    messages: {
      method: 'Direct DOM change `.{{name}}()` in a fixer: use Dostupno.changes.* so it can be reverted.',
      assign: 'Direct DOM write to `.{{name}}` in a fixer: use Dostupno.changes.* so it can be reverted.',
      style: 'Direct style write in a fixer: use Dostupno.changes.setStyle so it can be reverted.',
      classList: 'Direct classList change in a fixer: use Dostupno.changes.* so it can be reverted.',
    },
    schema: [],
  },
  create(context) {
    const isChangesApi = (callee) => {
      // Dostupno.changes.setAttr(...) or D.changes.setAttr(...)
      const obj = callee.object;
      return obj?.type === 'MemberExpression' && propName(obj) === 'changes';
    };
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        const name = propName(callee);
        if (!name || isChangesApi(callee)) return;
        if (callee.object.type === 'MemberExpression' && propName(callee.object) === 'classList') {
          if (['add', 'remove', 'toggle', 'replace'].includes(name)) context.report({ node, messageId: 'classList' });
          return;
        }
        if (!MUTATING_METHODS.has(name)) return;
        const first = node.arguments[0];
        if (['setAttribute', 'removeAttribute'].includes(name) && first?.type === 'Literal' && ALLOWED_ATTRS.has(first.value)) return;
        // Plain arrays/sets (`out.push`, `set.remove`) aren't DOM: only flag DOM-only names
        // and `remove()` with no arguments (Element.remove).
        if (name === 'remove' && node.arguments.length) return;
        if (['append', 'prepend', 'before', 'after'].includes(name) && callee.object.type === 'Identifier' && /^(out|parts|list|arr)/.test(callee.object.name)) return;
        context.report({ node, messageId: 'method', data: { name } });
      },
      AssignmentExpression(node) {
        const left = node.left;
        if (left.type !== 'MemberExpression') return;
        // el.style.color = ... / el.style[prop] = ...
        if (left.object.type === 'MemberExpression' && propName(left.object) === 'style') {
          context.report({ node, messageId: 'style' });
          return;
        }
        const name = propName(left);
        if (name && MUTATING_PROPS.has(name) && left.object.type !== 'ThisExpression') {
          context.report({ node, messageId: 'assign', data: { name } });
        }
      },
    };
  },
};
