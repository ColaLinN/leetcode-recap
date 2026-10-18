import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import type { ExecutionResult } from "./types";
import { formatValue, statusLabel } from "./ui";
export default function ResultView({ result }: { result: ExecutionResult }) {
  const firstFailure =
    result.results?.findIndex((r) => r.status !== "Accepted") ?? -1;
  const [selected, setSelected] = useState(
    firstFailure >= 0 ? firstFailure : 0,
  );
  useEffect(() => {
    const failure =
      result.results?.findIndex((r) => r.status !== "Accepted") ?? -1;
    setSelected(failure >= 0 ? failure : 0);
  }, [result]);
  const caseResult = result.results?.[selected];
  const success = result.status === "Accepted";
  return (
    <div className="execution-result">
      <div className="execution-heading">
        <strong className={success ? "accepted-label" : "failed-label"}>
          {success ? <CheckCircle2 size={19} /> : <Circle size={18} />}{" "}
          {statusLabel(result.status)}
        </strong>
        <span>
          <Clock3 size={12} />
          {Math.round(result.elapsedMs)} ms
        </span>
      </div>
      <div className="result-note">
        {result.passed} / {result.total} 组测试通过 · 结果仅代表本地测试集
      </div>
      {result.detail && <p className="inline-error">{result.detail}</p>}
      {result.results?.length > 0 && (
        <>
          <div className="case-tabs">
            {result.results.map((r, i) => (
              <button
                key={i}
                className={`${selected === i ? "active" : ""} ${r.status === "Accepted" ? "pass" : "fail"}`}
                onClick={() => setSelected(i)}
              >
                <span />
                {`用例 ${i + 1}`}
              </button>
            ))}
          </div>
          {caseResult && (
            <div className="case-detail">
              <div className="case-value">
                <span>输入</span>
                <pre>{formatValue(caseResult.input)}</pre>
              </div>
              <div className="case-outputs">
                <div className="case-value">
                  <span>实际输出</span>
                  <pre
                    className={
                      caseResult.status !== "Accepted" ? "value-error" : ""
                    }
                  >
                    {formatValue(caseResult.actual)}
                  </pre>
                </div>
                <div className="case-value">
                  <span>预期输出</span>
                  <pre>{formatValue(caseResult.expected)}</pre>
                </div>
              </div>
              {caseResult.stdout && (
                <div className="case-value">
                  <span>标准输出</span>
                  <pre>{caseResult.stdout}</pre>
                </div>
              )}
              {caseResult.error && (
                <div className="case-value">
                  <span>错误详情</span>
                  <pre className="value-error">{caseResult.error}</pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
