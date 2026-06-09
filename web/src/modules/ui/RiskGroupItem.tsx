type RiskGroupItemProps = {
  rank: number;
  groupName: string;
  healthEffect: string;
};

export function RiskGroupItem({ rank, groupName, healthEffect }: RiskGroupItemProps) {
  return (
    <div className="risk-group-item">
      <span className="risk-group-rank">{rank}</span>
      <div className="risk-group-info">
        <strong>{groupName}</strong>
        <small>{healthEffect}</small>
      </div>
    </div>
  );
}
