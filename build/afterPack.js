// electron-builder afterPack 钩子：对 mac 应用做 ad-hoc（临时）签名。
//
// 目的：在没有 Apple 付费开发者证书的情况下，让应用：
//   1) 在 Apple 芯片（arm64）上可正常运行（arm64 要求二进制必须有签名）；
//   2) 从网络下载后走「未受信任的开发者 → 仍要打开」流程，
//      而不是直接被判定为「已损坏，无法打开」。
//
// ad-hoc 签名用 codesign 的 "-" 身份，不需要任何证书。
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  // 只处理 macOS 产物
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename; // 例如「灵光」
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[afterPack] 对 mac 应用做 ad-hoc 签名: ${appPath}`);
  // --force 覆盖已有签名，--deep 递归签名内部 Helper/Framework，-s - 表示 ad-hoc
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
  console.log(`[afterPack] ad-hoc 签名完成`);
};
