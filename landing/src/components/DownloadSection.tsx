import { useState, useEffect } from "react";
import { useAppMeta, type Platform } from "@/hooks/useAppMeta";
import { useInView } from "@/hooks/useInView";

/* ---------- 下载卡片 ---------- */
function DlCard({
  arch,
  hint,
  recommended,
  url,
  listCls,
}: {
  arch: string;
  hint: string;
  recommended: boolean;
  url: string;
  listCls: string;
}) {
  return (
    <div
      className={`dl-card reveal ${listCls} ${recommended ? "dl-recommended" : ""}`}
    >
      {recommended && <span className="dl-badge">推荐</span>}
      <h3>{arch}</h3>
      <p>{hint}</p>
      <a className="btn btn-primary" href={url}>
        下载安装包
      </a>
    </div>
  );
}

/* ---------- 平台切换 ---------- */
function PlatformTabs({
  active,
  onSelect,
}: {
  active: Platform;
  onSelect: (p: Platform) => void;
}) {
  const tabs: { key: Platform; label: string }[] = [
    { key: "mac", label: "macOS" },
    { key: "win", label: "Windows" },
  ];
  return (
    <div className="dl-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`dl-tab ${active === t.key ? "dl-tab-active" : ""}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 主组件 ---------- */
export default function DownloadSection() {
  const { ref, inView } = useInView<HTMLDivElement>("0px 0px -8% 0px");
  const listCls = inView ? "in-view" : "";
  const { version, platform, isMac, recommendedArch } = useAppMeta();

  // 默认选中用户当前平台
  const [activePlatform, setActivePlatform] = useState<Platform>("mac");
  useEffect(() => {
    if (platform !== "other") setActivePlatform(platform);
  }, [platform]);

  const macUrl = (arch: string) =>
    `/downloads/LingGuang-${version}-${arch}.dmg`;
  const winUrl = `/downloads/LingGuang-${version}-x64.exe`;

  return (
    <section className="section">
      <div className="container">
        <div ref={ref} className="dl-panel">
          <p className={`eyebrow reveal ${listCls}`}>03 · Download</p>
          <h2 className={`section-title reveal ${listCls}`}>选择你的平台</h2>
          <p className="section-sub">
            macOS 与 Windows 均已支持，选择对应平台下载安装包。
          </p>

          <div className={`reveal ${listCls}`}>
            <PlatformTabs
              active={activePlatform}
              onSelect={setActivePlatform}
            />
          </div>

          {activePlatform === "mac" ? (
            <>
              <div className="dl-grid">
                <DlCard
                  arch="macOS · Apple 芯片 (arm64)"
                  hint="M1 / M2 / M3 / M4 系列"
                  recommended={isMac && recommendedArch === "arm64"}
                  url={macUrl("arm64")}
                  listCls={listCls}
                />
                <DlCard
                  arch="macOS · Intel (x64)"
                  hint="2020 年前的旧款 Mac"
                  recommended={isMac && recommendedArch === "x64"}
                  url={macUrl("x64")}
                  listCls={listCls}
                />
              </div>
              <p className="dl-tip">
                首次打开如提示「无法验证开发者」：右键点击应用图标 →
                选择「打开」，或在 「系统设置 →
                隐私与安全性」中点击「仍要打开」。
              </p>
            </>
          ) : (
            <>
              <div className="dl-grid dl-grid-single">
                <DlCard
                  arch="Windows · x64"
                  hint="Windows 10 / 11（64 位）"
                  recommended={true}
                  url={winUrl}
                  listCls={listCls}
                />
              </div>
              <p className="dl-tip">
                下载后双击安装程序，按向导完成安装即可。如 Windows SmartScreen
                拦截， 点击「更多信息」→「仍要运行」。
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
