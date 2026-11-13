/** Shared, sanitized Mermaid rendering for Preview and live preview. */
import mermaid from 'mermaid';

let configured = false;
let seq = 0;

function ensureConfigured(): void {
  if (configured) return;
  // SVG <text> labels instead of HTML-in-<foreignObject>: the sanitizer below strips foreignObject, which
  // otherwise leaves every node label blank.
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  });
  configured = true;
}

/** Render Mermaid source into `target` (replacing its children). Shows a short message on invalid input. */
export async function renderMermaidInto(target: HTMLElement, code: string): Promise<void> {
  ensureConfigured();
  const id = `mermaid-${Date.now().toString(36)}-${seq++}`;
  try {
    const { svg } = await mermaid.render(id, code);
    const template = document.createElement('template');
    template.innerHTML = svg;
    template.content.querySelectorAll('script, iframe, object, embed, foreignObject').forEach(n => n.remove());
    template.content.querySelectorAll('*').forEach(node => {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && /^javascript:/i.test(value))) {
          node.removeAttribute(attribute.name);
        }
      }
    });
    target.replaceChildren(template.content.cloneNode(true));
  } catch {
    target.textContent = 'Invalid Mermaid diagram';
    target.classList.add('mnemo-mermaid-error');
  } finally {
    // mermaid.render leaves a temporary node behind on some errors.
    document.getElementById(`d${id}`)?.remove();
  }
}
