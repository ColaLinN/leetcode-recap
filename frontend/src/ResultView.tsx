import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock3, MapPin } from "lucide-react";
import type { ExecutionResult } from "./types";
import { statusLabel } from "./ui";
import ResultValue from "./ResultValue";
import { caseDiagnostic } from "./errorDiagnostics";
import type { ErrorDiagnostic } from "./errorDiagnostics";
export default function ResultView({ result, codeMatches = false, onNavigateError, isHistory = false }: {
  result: ExecutionResult;
  codeMatches?: boolean;
  onNavigateError?: (diagnostic: ErrorDiagnostic) => void;
  isHistory?: boolean;
}) {
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
  const diagnostic = caseResult ? caseDiagnostic(caseResult) : null;
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
      {!codeMatches && diagnostic && (
        <p className="result-source-notice">
          {isHistory ? "此错误来自这份历史代码。恢复这份代码后可跳转定位。" : "代码已修改；此错误来自上次执行，重新运行后可定位新代码。"}
        </p>
      )}
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
              <ResultValue value={caseResult.input} label="输入" />
              <div className="case-outputs">
                <ResultValue value={caseResult.actual} label="实际输出" error={caseResult.status !== "Accepted"} />
                <ResultValue value={caseResult.expected} label="预期输出" />
              </div>
              {caseResult.stdout && (
                <div className="case-value">
                  <span>标准输出</span>
                  <pre>{caseResult.stdout}</pre>
                </div>
              )}
              {caseResult.error && (
                <div className="case-value">
                  <div className="case-error-heading">
                    <span>错误详情</span>
                    {diagnostic && (
                      <button
                        className="error-location-link"
                        disabled={!codeMatches || !onNavigateError}
                        onClick={() => onNavigateError?.(diagnostic)}
                        title={codeMatches ? "跳转到编辑器中的错误位置" : "错误对应的代码与当前编辑器不同"}
                      >
                        <MapPin size={12} aria-hidden="true" />
                        第 {diagnostic.location.line} 行{diagnostic.location.column ? `，${diagnostic.location.column} 列` : ""}
                      </button>
                    )}
                  </div>
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
