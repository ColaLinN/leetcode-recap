import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-/, "math-inline", "math-display"],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", "math-inline", "math-display"],
    ],
  },
};
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt, ...props }) => (
            <img {...props} alt={alt ?? "笔记插图"} loading="lazy" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
