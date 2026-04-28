import React, { useEffect, useMemo, useState } from "react";
import { Tabs } from "antd";
import TaskList from "./components/TaskList";
import StoryGenerator from "./components/StoryGenerator";
import StorySplitPanel from "./components/StorySplitPanel";
import TopLinesPanel from "./components/TopLinesPanel";

const ROUTE_TAB_MAP = {
  "/": "tasks",
  "/rewrite": "tasks",
  "/story": "story",
  "/split": "split",
  "/top-lines": "topLines"
};

const TAB_ROUTE_MAP = {
  tasks: "/rewrite",
  story: "/story",
  split: "/split",
  topLines: "/top-lines"
};

const getTabByPath = pathname => {
  return ROUTE_TAB_MAP[pathname] || "tasks";
};

function replaceToDefaultRoute() {
  if (window.location.pathname !== "/rewrite") {
    window.history.replaceState({}, "", "/rewrite");
  }
}

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const currentTab = getTabByPath(window.location.pathname);
    if (!ROUTE_TAB_MAP[window.location.pathname]) {
      replaceToDefaultRoute();
    }
    return currentTab;
  });

  useEffect(() => {
    const handlePopState = () => {
      const currentTab = getTabByPath(window.location.pathname);
      if (!ROUTE_TAB_MAP[window.location.pathname]) {
        replaceToDefaultRoute();
        setActiveTab("tasks");
        return;
      }
      setActiveTab(currentTab);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleTabChange = key => {
    const nextRoute = TAB_ROUTE_MAP[key] || "/rewrite";
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({}, "", nextRoute);
    }
    setActiveTab(key);
  };

  const tabItems = useMemo(
    () => [
      {
        key: "tasks",
        label: "文本改写",
        children: <TaskList />
      },
      {
        key: "story",
        label: "小说生成",
        children: <StoryGenerator />
      },
      {
        key: "split",
        label: "小说拆分",
        children: <StorySplitPanel />
      },
      {
        key: "topLines",
        label: "前20行截取",
        children: <TopLinesPanel />
      }
    ],
    []
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ margin: "0 50px", padding: 10 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
            AI-TXT 文本处理工具
          </h1>
        </div>
      </div>
      <div style={{ margin: "0 50px" }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          size="large"
        />
      </div>
    </div>
  );
}

export default App;
