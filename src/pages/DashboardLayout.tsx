import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div>
      {/* sidebar / header */}
      <Outlet />
    </div>
  );
}