import { hasSacramentMeeting, type Unit } from "../lib/directory";
import { LanguageBadge } from "./language-badge";

const meetingTimeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" });

function formatMeetingTime(time: string) {
  return meetingTimeFormat.format(new Date(`2000-01-01T${time.slice(0, 5)}:00Z`));
}

type UnitLanguageProps = { unit: Unit; languageNames: Map<string, string> };

export function UnitLanguageBadges({ unit, languageNames }: UnitLanguageProps) {
  const language = unit.language_id && languageNames.get(unit.language_id);
  const subLanguage = unit.has_sub_congregation && unit.sub_congregation_language_id
    && languageNames.get(unit.sub_congregation_language_id);

  return <>
    {language && <LanguageBadge name={language} />}
    {subLanguage && <LanguageBadge name={subLanguage} subCongregation />}
  </>;
}

export function UnitFacts({ unit, languageNames }: UnitLanguageProps) {
  return <span className="chips">
    <UnitLanguageBadges unit={unit} languageNames={languageNames} />
    {unit.sacrament_meeting_first === false && unit.first_meeting_time && <span className="chip">
      First meeting at {formatMeetingTime(unit.first_meeting_time)}
    </span>}
    {unit.sacrament_meeting_time && <span className="chip">Sacrament at {formatMeetingTime(unit.sacrament_meeting_time)}</span>}
    {hasSacramentMeeting(unit.kind) && unit.sacrament_meeting_first != null && <span className="chip">
      {unit.sacrament_meeting_first ? "Sacrament first" : "Sacrament after another meeting"}
    </span>}
    {unit.council_meeting_time && <span className="chip">Council at {formatMeetingTime(unit.council_meeting_time)}</span>}
  </span>;
}
