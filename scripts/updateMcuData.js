const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

const currentMcuData = require('../src/mcuData');

// Lista de títulos não-MCU para remover
const nonMcuTitles = [
  'Godzilla: King of the Monsters',
  'Godzilla',
  'Godzilla vs. Kong',
  'Godzilla x Kong: The New Empire'
];

async function fetchMcuCollection() {
  const url = `https://api.themoviedb.org/3/collection/535313?api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await axios.get(url).catch(() => ({ data: { parts: [] } }));
  console.log(`Fetched MCU Collection: ${res.data.parts.length} items`);
  return res.data.parts.map(item => ({ ...item, type: 'movie' }));
}

async function fetchNewMcuReleases() {
  const upcomingMoviesUrl = `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
  const discoverMoviesUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_companies=420&sort_by=release_date.asc&page=1`;
  const discoverSeriesUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_companies=420&sort_by=first_air_date.asc&page=1`;

  const [upcomingMoviesRes, discoverMoviesRes, discoverSeriesRes] = await Promise.all([
    axios.get(upcomingMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(discoverMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(discoverSeriesUrl).catch(() => ({ data: { results: [] } }))
  ]);

  // Como with_companies=420 já filtra pela Marvel Studios, não precisamos de um filtro adicional
  const upcomingMovies = upcomingMoviesRes.data.results.map(item => {
    console.log(`Upcoming Movie: ${item.title}`);
    return { ...item, type: 'movie' };
  });
  const discoverMovies = discoverMoviesRes.data.results.map(item => {
    console.log(`Discover Movie: ${item.title}`);
    return { ...item, type: 'movie' };
  });
  const discoverSeries = discoverSeriesRes.data.results.map(item => {
    console.log(`Discover Series: ${item.name}`);
    return { ...item, type: 'series' };
  });

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

  // Filtrar itens não-MCU do mcuData existente
  const filteredMcuData = currentMcuData.filter(item => !nonMcuTitles.includes(item.title));
  console.log(`After filtering non-MCU items, mcuData length: ${filteredMcuData.length}`);

  const mcuCollection = await fetchMcuCollection();
  const newReleases = await fetchNewMcuReleases();

  const updatedMcuData = [...filteredMcuData];
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
