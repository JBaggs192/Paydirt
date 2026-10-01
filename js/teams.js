// Team colors drive the end zones, scoreboard gradients and possession glow.
export const TEAMS = {
  "Arizona Cardinals":     { bg: "#000000", text: "#97233F", outline: "#FFFFFF", logo: "team_logos/Arizona_Cardinals_logo.svg.png" },
  "Atlanta Falcons":       { bg: "#000000", text: "#A71930", outline: "#C7C9CB", logo: "team_logos/Atlanta_Falcons_logo.svg.png" },
  "Baltimore Ravens":      { bg: "#000000", text: "#241773", outline: "#9E7C0C", logo: "team_logos/Baltimore_Ravens_logo.svg.png" },
  "Buffalo Bills":         { bg: "#00338D", text: "#C60C30", outline: "#FFFFFF", logo: "team_logos/Buffalo_Bills_logo.svg.png" },
  "Carolina Panthers":     { bg: "#000000", text: "#0085CA", outline: "#BFC0BF", logo: "team_logos/Carolina_Panthers_logo.svg.png" },
  "Chicago Bears":         { bg: "#0B162A", text: "#C83803", outline: "#FFFFFF", logo: "team_logos/Chicago_Bears_logo_primary.svg.png" },
  "Cincinnati Bengals":    { bg: "#000000", text: "#FB4F14", outline: "#FFFFFF", logo: "team_logos/Cincinnati_Bengals_logo.svg.png" },
  "Cleveland Browns":      { bg: "#311D00", text: "#FF3C00", outline: "#FFFFFF", logo: "team_logos/Cleveland_Browns_logo.svg.png" },
  "Dallas Cowboys":        { bg: "#002244", text: "#869397", outline: "#FFFFFF", logo: "team_logos/Dallas_Cowboys.svg.png" },
  "Denver Broncos":        { bg: "#002244", text: "#FB4F14", outline: "#FFFFFF", logo: "team_logos/Denver_Broncos_logo.svg.png" },
  "Detroit Lions":         { bg: "#0076B6", text: "#B0B7BC", outline: "#000000", logo: "team_logos/Detroit_Lions_logo.svg.png" },
  "Green Bay Packers":     { bg: "#203731", text: "#FFB612", outline: "#FFFFFF", logo: "team_logos/Green_Bay_Packers_logo.svg.png" },
  "Houston Texans":        { bg: "#021018", text: "#A71930", outline: "#FFFFFF", logo: "team_logos/Houston_Texans_logo.svg.png" },
  "Indianapolis Colts":    { bg: "#002C5F", text: "#FFFFFF", outline: "#A5ACAF", logo: "team_logos/Indianapolis_Colts_logo.svg.png" },
  "Jacksonville Jaguars":  { bg: "#000000", text: "#006778", outline: "#D7A22A", logo: "team_logos/Jacksonville_Jaguars_logo.svg.png" },
  "Kansas City Chiefs":    { bg: "#B0122A", text: "#FFB81C", outline: "#FFFFFF", logo: "team_logos/Kansas_City_Chiefs_logo.svg.png" },
  "Las Vegas Raiders":     { bg: "#000000", text: "#A5ACAF", outline: "#FFFFFF", logo: "team_logos/Las_Vegas_Raiders_logo.svg.png" },
  "Los Angeles Chargers":  { bg: "#0080C6", text: "#FFC20E", outline: "#FFFFFF", logo: "team_logos/Los_Angeles_Chargers_logo.svg.png" },
  "Los Angeles Rams":      { bg: "#003594", text: "#FFA300", outline: "#FFFFFF", logo: "team_logos/Los_Angeles_Rams_logo.svg.png" },
  "Miami Dolphins":        { bg: "#008E97", text: "#FC4C02", outline: "#FFFFFF", logo: "team_logos/Miami_Dolphins_logo.svg.png" },
  "Minnesota Vikings":     { bg: "#4F2683", text: "#FFC62F", outline: "#FFFFFF", logo: "team_logos/Minnesota_Vikings_logo.svg.png" },
  "New England Patriots":  { bg: "#002244", text: "#C60C30", outline: "#B0B7BC", logo: "team_logos/New_England_Patriots_logo.svg.png" },
  "New Orleans Saints":    { bg: "#000000", text: "#D3BC8D", outline: "#FFFFFF", logo: "team_logos/New_Orleans_Saints_logo.svg.png" },
  "New York Giants":       { bg: "#0B2265", text: "#A71930", outline: "#FFFFFF", logo: "team_logos/New_York_Giants_logo.svg.png" },
  "New York Jets":         { bg: "#115740", text: "#FFFFFF", outline: "#000000", logo: "team_logos/New_York_Jets_2024.svg.png" },
  "Philadelphia Eagles":   { bg: "#004851", text: "#A5ACAF", outline: "#000000", logo: "team_logos/Philadelphia_Eagles_logo.svg.png" },
  "Pittsburgh Steelers":   { bg: "#000000", text: "#FFB612", outline: "#FFFFFF", logo: "team_logos/Pittsburgh_Steelers_logo.svg.png" },
  "San Francisco 49ers":   { bg: "#AA0000", text: "#B3995D", outline: "#FFFFFF", logo: "team_logos/San_Francisco_49ers_logo.svg.png" },
  "Seattle Seahawks":      { bg: "#002244", text: "#69BE28", outline: "#A5ACAF", logo: "team_logos/Seattle_Seahawks_logo.svg.png" },
  "Tampa Bay Buccaneers":  { bg: "#A71930", text: "#34302B", outline: "#FFFFFF", logo: "team_logos/Tampa_Bay_Buccaneers_logo.svg.png" },
  "Tennessee Titans":      { bg: "#002244", text: "#4B92DB", outline: "#C60C30", logo: "team_logos/Tennessee_Titans_logo.svg.png" },
  "Washington Commanders": { bg: "#5A1414", text: "#FFB612", outline: "#000000", logo: "team_logos/Washington_Commanders_logo.svg.png" },
};

export const DEFAULT_TEAMS = { team1: "Detroit Lions", team2: "Minnesota Vikings" };

export const mascot = name => name.split(" ").pop().toUpperCase();

// Black primaries vanish on the dark board, so those teams glow in their secondary color.
export function accentColor(name) {
  const team = TEAMS[name];
  if (!team) return "#FFFFFF";
  return team.bg.toUpperCase() === "#000000" ? team.text : team.bg;
}

export function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map(c => c + c).join("");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
