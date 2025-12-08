curl "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=401823448" | jq '.boxscore.teams[].team.id'

stats:
https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=401823448" | jq '.boxscore.teams[]'