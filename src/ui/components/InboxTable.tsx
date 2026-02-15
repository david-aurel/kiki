interface InboxRow {
  key: string;
  notificationId: string;
  reason: string;
  createdAt: string;
}

interface InboxTableProps {
  title: string;
  rows: InboxRow[];
}

export function InboxTable({ title, rows }: InboxTableProps) {
  return (
    <section>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="kpi">No entries yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Notification</th>
              <th>Reason</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice().reverse().slice(0, 50).map((entry) => (
              <tr key={entry.key}>
                <td>{entry.notificationId}</td>
                <td>{entry.reason}</td>
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
