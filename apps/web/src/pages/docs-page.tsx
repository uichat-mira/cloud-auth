import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { Link, Navigate, NavLink, useLocation, useParams } from "react-router-dom";
import { resolveDocHref } from "@/lib/docs/markdown-links";
import { defaultDocId, docGroups, docs, docsInGroup, getDoc } from "@/lib/docs/registry";

function createComponents(sourcePath: string): Components {
  const Anchor: NonNullable<Components["a"]> = ({ href, children }) => {
    const resolved = resolveDocHref(href ?? "", sourcePath, docs);
    if (!resolved) return <>{children}</>;
    if (resolved.external) {
      return (
        <a href={resolved.href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      );
    }
    if (resolved.href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(resolved.href)) {
      return <a href={resolved.href}>{children}</a>;
    }
    return <Link to={resolved.href}>{children}</Link>;
  };

  const H1: NonNullable<Components["h1"]> = ({ id, children }) => (
    <h1 id={id} tabIndex={-1}>
      {children}
    </h1>
  );
  const H2: NonNullable<Components["h2"]> = ({ id, children }) => <h2 id={id}>{children}</h2>;
  const H3: NonNullable<Components["h3"]> = ({ id, children }) => <h3 id={id}>{children}</h3>;
  const H4: NonNullable<Components["h4"]> = ({ id, children }) => <h4 id={id}>{children}</h4>;
  const Table: NonNullable<Components["table"]> = ({ children }) => (
    <div className="docs-table">
      <table>{children}</table>
    </div>
  );

  return { a: Anchor, h1: H1, h2: H2, h3: H3, h4: H4, table: Table };
}

function DocsMissing() {
  return (
    <div className="docs-missing">
      <h1>文档不存在</h1>
      <p>这份文档不存在或已经调整。</p>
      <Link to={`/docs/${defaultDocId}`}>返回开发指南</Link>
    </div>
  );
}

export function DocsPage() {
  const { docId } = useParams();
  const { hash } = useLocation();
  const doc = getDoc(docId);
  const articleRef = useRef<HTMLElement>(null);
  const previousDoc = useRef(docId);
  const components = useMemo(() => createComponents(doc?.sourcePath ?? ""), [doc?.sourcePath]);

  useEffect(() => {
    if (!docId) return;
    const changed = previousDoc.current !== docId;
    previousDoc.current = docId;

    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      target?.scrollIntoView?.({ block: "start" });
      return;
    }

    if (!changed) return;
    window.scrollTo({ top: 0 });
    const heading = articleRef.current?.querySelector<HTMLElement>("h1");
    heading?.focus({ preventScroll: true });
  }, [docId, hash]);

  if (!docId) {
    return <Navigate to={`/docs/${defaultDocId}`} replace />;
  }

  return (
    <div className="cloud-docs">
      <aside className="docs-rail">
        <nav aria-label="文档目录" className="docs-nav">
          {docGroups.map((group) => (
            <div className="docs-group" key={group}>
              <p className="docs-group-title">{group}</p>
              {docsInGroup(group).map((entry) => (
                <NavLink key={entry.id} to={`/docs/${entry.id}`} className="docs-nav-link">
                  {entry.navLabel}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <article className="docs-article" ref={articleRef}>
        {doc ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={components}
          >
            {doc.body}
          </ReactMarkdown>
        ) : (
          <DocsMissing />
        )}
      </article>
    </div>
  );
}
