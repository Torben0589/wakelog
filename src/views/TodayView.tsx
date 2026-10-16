import { EpisodePanel } from '../components/EpisodePanel';
import { Icon } from '../components/Icons';
import { formatNightLabel } from '../lib/time';
import { useApp } from '../state/AppContext';

export function TodayView() {
  const { data, currentNight, openNightInCalendar } = useApp();

  // Zuletzt bearbeitete Nacht (falls nicht die aktuelle) als Schnellzugriff
  const lastEdited = [...data.episodes].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  const showLast = lastEdited && lastEdited.nightDate !== currentNight;

  return (
    <div className="view">
      <EpisodePanel nightDate={currentNight} autoNight />
      {showLast && (
        <button type="button" className="card link-card" onClick={() => openNightInCalendar(lastEdited.nightDate)}>
          <span>
            <span className="eyebrow">Zuletzt bearbeitet</span>
            <span className="link-card-title">Nacht {formatNightLabel(lastEdited.nightDate)}</span>
          </span>
          <Icon name="chevronRight" />
        </button>
      )}
      <p className="footnote">
        Ereignisse vor 18:00 Uhr gehören automatisch zur Nacht des Vortags. Eine Nacht wird unter dem Datum des Abends geführt, an dem sie begann.
      </p>
    </div>
  );
}
