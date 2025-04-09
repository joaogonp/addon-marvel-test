const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

const currentMcuData = require('../src/mcuData');

async function fetchMcuCollection() {
  const url = `https://api.themoviedb.org/3/collection/535313?api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await axios.get(url).catch(() => ({ data: { parts: [] } }));
  console.log(`Fetched MCU Collection: ${res.data.parts.length} items`);
  return res.data.parts.map(item => ({ ...item, type: 'movie' }));
}

async function fetchNewMcuReleases() {
  const upcomingMoviesUrl = `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
  const discoverMoviesUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_companies=420&sort_by=release_date.asc`;
  const discoverSeriesUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_companies=420&sort_by=first_air_date.asc`;

  const [upcomingMoviesRes, discoverMoviesRes, discoverSeriesRes] = await Promise.all([
    axios.get(upcomingMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(discoverMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(discoverSeriesUrl).catch(() => ({ data: { results: [] } }))
  ]);

  const filterMarvel = (item) => {
    const isMarvel = item.production_companies?.some(company => company.id === 420);
    if (!isMarvel) {
      console.log(`Filtered out non-Marvel item: ${item.title || item.name}`);
    }
    return isMarvel;
  };

  const upcomingMovies = upcomingMoviesRes.data.results.filter(filterMarvel).map(item => ({ ...item, type: 'movie' }));
  const discoverMovies = discoverMoviesRes.data.results.filter(filterMarvel).map(item => ({ ...item, type: 'movie' }));
  const discoverSeries = discoverSeriesRes.data.results.filter(filterMarvel).map(item => ({ ...item, type: 'series' }));

  console.log(`Upcoming Movies: ${upcomingMovies.length}, Discover Movies: ${discoverMovies.length}, Discover Series: ${discoverSeries.length}`);
  return [...upcomingMovies, ...discoverMovies, ...discoverSeries];
}

async function getImdbId(title, year) {
  const omdbUrl = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year}&apikey=${OMDB_API_KEY}`;
  const res = await axios.get(omdbUrl).catch(() => ({}));
  const imdbId = res.data?.imdbID || null;
  console.log(`OMDb lookup for ${title} (${year}): ${imdbId || 'Not found'}`);
  return imdbId;
}

async function updateMcuData() {
  console.log('Starting update of mcuData.js...');
  console.log(`Current mcuData length: ${currentMcuData.length}`);

  const mcuCollection = await fetchMcuCollection();
  const newReleases = await fetchNewMcuReleases();

  const updatedMcuData = [...currentMcuData];
  const existingIds = new Set(updatedMcuData.map(item => item.imdbId));

  const allReleases = [...mcuCollection, ...newReleases];
  console.log(`Total releases to process: ${allReleases.length}`);

  for (const release of allReleases) {
    const title = (release.title || release.name || '').replace(/Season \d+/i, '').trim();
    const releaseYear = (release.release_date || release.first_air_date || 'TBD').split('-')[0];

    if (release.genre_ids?.includes(16) && title !== 'What If...?') {
      console.log(`Skipping animation: ${title}`);
      continue;
    }

    const imdbId = await getImdbId(title, releaseYear);
    const uniqueId = imdbId || `tmdb-${release.id}`;
    if (existingIds.has(uniqueId)) {
      console.log(`Skipping duplicate: ${title} (${uniqueId})`);
      continue;
    }

    const newEntry = {
      title: title,
      type: release.type,
      imdbId: imdbId || `tmdb-${release.id}`,
      releaseYear: releaseYear,
      poster: release.poster_path ? `https://image.tmdb.org/t/p/w500${release.poster_path}` : null
    };

    updatedMcuData.push(newEntry);
    existingIds.add(uniqueId);
    console.log(`Added new release: ${title} (${newEntry.imdbId})`);
  }

  const fileContent = `module.exports = ${JSON.stringify(updatedMcuData, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, '../src/mcuData.js'), fileContent, 'utf8');
  console.log(`mcuData.js updated successfully with ${updatedMcuData.length} items`);
}

updateMcuData().catch(err => {
  console.error('Error updating MCU data:', err);
  process.exit(1);
});
