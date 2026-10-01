// Team colors drive the end zones, scoreboard gradients and possession glow.
export const TEAMS = {
  "Arizona Cardinals":     { bg: "#97233F", text: "#FFFFFF", outline: "#000000", logo: "team_logos/Arizona_Cardinals_logo.svg.png" },
  "Atlanta Falcons":       { bg: "#A71930", text: "#000000", outline: "#FFFFFF", logo: "team_logos/Atlanta_Falcons_logo.svg.png" },
  "Baltimore Ravens":      { bg: "#241773", text: "#FFFFFF", outline: "#9E7C0C", logo: "team_logos/Baltimore_Ravens_logo.svg.png" },
  "Buffalo Bills":         { bg: "#00338D", text: "#C60C30", outline: "#FFFFFF", logo: "team_logos/Buffalo_Bills_logo.svg.png" },
  "Carolina Panthers":     { bg: "#0085CA", text: "#101820", outline: "#BFC0BF", logo: "team_logos/Carolina_Panthers_logo.svg.png" },
  "Chicago Bears":         { bg: "#0B162A", text: "#C83803", outline: "#FFFFFF", logo: "team_logos/Chicago_Bears_logo_primary.svg.png" },
  "Cincinnati Bengals":    { bg: "#FB4F14", text: "#000000", outline: "#FFFFFF", logo: "team_logos/Cincinnati_Bengals_logo.svg.png" },
  "Cleveland Browns":      { bg: "#311D00", text: "#FF3C00", outline: "#FFFFFF", logo: "team_logos/Cleveland_Browns_logo.svg.png" },
  "Dallas Cowboys":        { bg: "#002244", text: "#869397", outline: "#FFFFFF", logo: "team_logos/Dallas_Cowboys.svg.png" },
  "Denver Broncos":        { bg: "#002244", text: "#FB4F14", outline: "#FFFFFF", logo: "team_logos/Denver_Broncos_logo.svg.png" },
  "Detroit Lions":         { bg: "#0076B6", text: "#B0B7BC", outline: "#000000", logo: "team_logos/Detroit_Lions_logo.svg.png" },
  "Green Bay Packers":     { bg: "#203731", text: "#FFB612", outline: "#FFFFFF", logo: "team_logos/Green_Bay_Packers_logo.svg.png" },
  "Houston Texans":        { bg: "#A71930", text: "#03202F", outline: "#FFFFFF", logo: "team_logos/Houston_Texans_logo.svg.png" },
  "Indianapolis Colts":    { bg: "#002C5F", text: "#FFFFFF", outline: "#A5ACAF", logo: "team_logos/Indianapolis_Colts_logo.svg.png" },
  "Jacksonville Jaguars":  { bg: "#006778", text: "#D7A22A", outline: "#101820", logo: "team_logos/Jacksonville_Jaguars_logo.svg.png" },
  "Kansas City Chiefs":    { bg: "#E31837", text: "#FFB81C", outline: "#FFFFFF", logo: "team_logos/Kansas_City_Chiefs_logo.svg.png" },
  "Las Vegas Raiders":     { bg: "#000000", text: "#A5ACAF", outline: "#FFFFFF", logo: "team_logos/Las_Vegas_Raiders_logo.svg.png" },
  "Los Angeles Chargers":  { bg: "#0080C6", text: "#FFC20E", outline: "#FFFFFF", logo: "team_logos/Los_Angeles_Chargers_logo.svg.png" },
  "Los Angeles Rams":      { bg: "#003594", text: "#FFA300", outline: "#FFFFFF", logo: "team_logos/Los_Angeles_Rams_logo.svg.png" },
  "Miami Dolphins":        { bg: "#008E97", text: "#FC4C02", outline: "#FFFFFF", logo: "team_logos/Miami_Dolphins_logo.svg.png" },
  "Minnesota Vikings":     { bg: "#4F2683", text: "#FFC62F", outline: "#FFFFFF", logo: "team_logos/Minnesota_Vikings_logo.svg.png" },
  "New England Patriots":  { bg: "#002244", text: "#C60C30", outline: "#B0B7BC", logo: "team_logos/New_England_Patriots_logo.svg.png" },
  "New Orleans Saints":    { bg: "#D3BC8D", text: "#101820", outline: "#FFFFFF", logo: "team_logos/New_Orleans_Saints_logo.svg.png" },
  "New York Giants":       { bg: "#0B2265", text: "#A71930", outline: "#FFFFFF", logo: "team_logos/New_York_Giants_logo.svg.png" },
  "New York Jets":         { bg: "#115740", text: "#FFFFFF", outline: "#000000", logo: "team_logos/New_York_Jets_2024.svg.png" },
  "Philadelphia Eagles":   { bg: "#004851", text: "#A5ACAF", outline: "#000000", logo: "team_logos/Philadelphia_Eagles_logo.svg.png" },
  "Pittsburgh Steelers":   { bg: "#FFB612", text: "#101820", outline: "#FFFFFF", logo: "team_logos/Pittsburgh_Steelers_logo.svg.png" },
  "San Francisco 49ers":   { bg: "#AA0000", text: "#B3995D", outline: "#FFFFFF", logo: "team_logos/San_Francisco_49ers_logo.svg.png" },
  "Seattle Seahawks":      { bg: "#002244", text: "#69BE28", outline: "#A5ACAF", logo: "team_logos/Seattle_Seahawks_logo.svg.png" },
  "Tampa Bay Buccaneers":  { bg: "#D50A0A", text: "#34302B", outline: "#FFFFFF", logo: "team_logos/Tampa_Bay_Buccaneers_logo.svg.png" },
  "Tennessee Titans":      { bg: "#002244", text: "#4B92DB", outline: "#C60C30", logo: "team_logos/Tennessee_Titans_logo.svg.png" },
  "Washington Commanders": { bg: "#5A1414", text: "#FFB612", outline: "#000000", logo: "team_logos/Washington_Commanders_logo.svg.png" },
};

export const DEFAULT_TEAMS = { team1: "Los Angeles Chargers", team2: "Kansas City Chiefs" };

export const mascot = name => name.split(" ").pop().toUpperCase();
export const city = name => name.split(" ").slice(0, -1).join(" ").toUpperCase();

// Black primaries vanish on the dark board, so those teams glow in their secondary color.
export function accentColor(name) {
  const team = TEAMS[name];
  if (!team) return "#FFFFFF";
  return team.bg.toUpperCase() === "#000000" ? team.text : team.bg;
}

// Light primaries (gold, etc.) need dark text on top of them.
export function isLight(name) {
  const n = parseInt(TEAMS[name].bg.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}
