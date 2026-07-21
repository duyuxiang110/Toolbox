/**
 * mammoth（docx → HTML）类型声明
 * mammoth 未自带 TypeScript 类型，此处补充最小可用声明。
 */
declare module 'mammoth' {
  export interface MammothMessage {
    type: string;
    message: string;
  }
  export interface MammothResult {
    /** 转换得到的 HTML 字符串 */
    value: string;
    messages: MammothMessage[];
  }
  export interface MammothInput {
    /** docx 文件的 ArrayBuffer（浏览器环境） */
    arrayBuffer?: ArrayBuffer;
  }
  export interface MammothOptions {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    includeEmbeddedStyleMap?: boolean;
    [key: string]: unknown;
  }
  interface Mammoth {
    convertToHtml(input: MammothInput, options?: MammothOptions): Promise<MammothResult>;
    extractRawText(input: MammothInput): Promise<MammothResult>;
  }
  const mammoth: Mammoth;
  export default mammoth;
}
