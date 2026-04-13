import React from "react";
import { Routes, Route } from "react-router-dom";
import NavBar   from "./components/NavBar";
import Home     from "./pages/Home";
import NewJob   from "./pages/NewJob";
import JobDetail from "./pages/JobDetail";
import Editor   from "./pages/Editor";

export default function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/"                    element={<Home />} />
          <Route path="/new"                 element={<NewJob />} />
          <Route path="/jobs/:jobId"         element={<JobDetail />} />
          <Route path="/jobs/:jobId/edit"    element={<Editor />} />
          <Route path="/jobs/:jobId/edit/:clipId" element={<Editor />} />
        </Routes>
      </main>
    </div>
  );
}
