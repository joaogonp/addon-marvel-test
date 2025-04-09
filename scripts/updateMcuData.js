const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

const currentMcuData = require('../src/mcuData');

async function fetchMcuCollection() {
  const url = `https://api.themoviedb.org/3/collection/535313?api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await axios.get(url).catch(() => ({ data: { parts: [] } }));
  return res.data.parts.map(item => ({ ...item, type: 'movie' }));
}

async function fetchNewMcuReleases() {
  const upcomingMoviesUrl = `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
  const discoverMoviesUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_companies=420&sort_by=release_date.asc`; // Marvel Studios
  const discoverSeriesUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_companies=420&sort_by=first_air_date.asc`;

  const [upcomingMoviesRes, discoverMoviesRes, discoverSeriesRes] = await Promise.all([
    axios.get(upcomingMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(discoverMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(discoverSeriesUrl).catch(() => ({ data: { results: [] } }))
  ]);

  const filterMarvel = (item) => {
    return item.production_companies?.some(company => company.id === 420); // Apenas Marvel Studios
  };

  const upcomingMovies = upcomingMoviesRes.data.results.filter(filterMarvel).map(item => ({ ...item, type: 'movie' }));
  const discoverMovies = discoverMoviesRes.data.results.filter(filterMarvel).map(item => ({ ...item, type: 'movie' }));
  const discoverSeries = discoverSeriesRes.data.results.filter(filterMarvel).map(item => ({ ...item, type: 'series' }));

  return [...upcomingMovies, ...discoverMovies, ...discoverSeries];
}

async function getImdbId(title, year) {
  const omdbUrl = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year}&apikey=${OMDB_API_KEY}`;
  const res = await axios.get(omdbUrl).catch(() => ({}));
  return res.data?.imdbID || null;
}

async function updateMcuData() {
  console.log('Fetching MCU collection and new releases...');
  const mcuCollection = await fetchMcuCollection();
  const newReleases = await fetchNewMcuReleases();

  const updatedMcuData = [...currentMcuData];
  const existingIds = new Set(updatedMcuData.map(item => item.imdbId));

  const allReleases = [...mcuCollection, ...newReleases];

  for (const release of allReleases) {
    const title = (release.title || release.name || '').replace(/Season \d+/i, '').trim();
    const releaseYear = (release.release_date || release.first_air_date || 'TBD').split('-')[0];

    if (release.genre_ids?.includes(16) && title !== 'What If...?') {
      continue;
    }

    const imdbId = await getImdbId(title, releaseYear);
    if (!imdbId || existingIds.has(imdbId)) {
      continue;
    }

    const newEntry = {
      title: title,
      type: release.type,
      imdbId: imdbId,
      releaseYear: releaseYear,
      poster: release.poster_path ? `https://image.tmdb.org/t/p/w500${release.poster_path}` : null
    };

    updatedMcuData.push(newEntry);
    existingIds.add(imdbId);
    console.log(`Added new release: ${title} (${imdbId})`);
  }

  const fileContent = `module.exports = ${JSON.stringify(updatedMcuData, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, '../src/mcuData.js'), fileContent, 'utf8');
  console.log('mcuData.js updated successfully');
}

updateMcuData().catch(err => {
  console.error('Error updating MCU data:', err);
  process.exit(1);
});
