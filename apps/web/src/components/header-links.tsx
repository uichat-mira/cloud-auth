import { NavLink } from "react-router-dom";

export function HeaderLinks() {
  return (
    <div className="header-links">
      <NavLink to="/open-platform" className="header-link">
        开放平台
      </NavLink>
      <NavLink to="/docs" className="header-link">
        文档
      </NavLink>
    </div>
  );
}
