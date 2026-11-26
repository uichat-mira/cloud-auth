import { NavLink } from "react-router-dom";

export function HeaderLinks() {
  return (
    <div className="header-links">
      <span className="header-link header-link-placeholder">开放平台</span>
      <NavLink to="/docs" className="header-link">
        文档
      </NavLink>
    </div>
  );
}
