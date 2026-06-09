import "./LoadingPlaceholder.css";

type LoadingPlaceholderProps = {
  lines?: number;
};

export function LoadingPlaceholder({ lines = 3 }: LoadingPlaceholderProps) {
  return (
    <div className="loading-placeholder" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <div
          className="loading-placeholder-line"
          key={index}
          style={{ width: `${70 + Math.round((index * 17) % 30)}%` }}
        />
      ))}
    </div>
  );
}
