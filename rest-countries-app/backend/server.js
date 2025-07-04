require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apicache = require('apicache');
const app = express();

const cache = apicache.middleware;
const PORT = process.env.PORT || 3001;
const COUNTRIES_API = 'https://restcountries.com/v3.1';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

// Autenticação simples (Bearer Token)
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'secrettoken123';
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || auth.split(' ')[1] !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

// Helper para formatar dados do país
const formatCountry = (country) => ({
  name: country.name?.common || null,
  officialName: country.name?.official || null,
  code: country.cca2 || null,
  cca3: country.cca3 || null,
  flag: country.flags?.svg || country.flags?.png || null,
  population: country.population || null,
  region: country.region || null,
  subregion: country.subregion || null,
  capital: Array.isArray(country.capital) ? country.capital[0] : null,
  languages: country.languages ? Object.values(country.languages) : null,
  currencies: country.currencies
    ? Object.entries(country.currencies).map(([code, { name, symbol }]) => ({
        code,
        name,
        symbol
      }))
    : null,
  maps: {
    googleMaps: country.maps?.googleMaps,
    openStreetMaps: country.maps?.openStreetMaps
  },
  timezones: country.timezones || null,
  coordinates: country.latlng || null
});

// Endpoint de teste
app.get('/api/test', (req, res) => {
  res.json({ ok: true });
});


// Detalhes de um país por nome
app.get('/api/countries/:name', authMiddleware, cache('10 minutes'), async (req, res) => {
  try {
    const { name } = req.params;

    let response;

    try {
      // Tenta com fullText
      response = await axios.get(`${COUNTRIES_API}/name/${encodeURIComponent(name)}?fullText=true`);
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 404) {
        // Fallback sem fullText
        response = await axios.get(`${COUNTRIES_API}/name/${encodeURIComponent(name)}`);
      } else {
        throw error; // outros erros (timeout etc.)
      }
    }

    if (!response.data || response.data.length === 0) {
      return res.status(404).json({
        error: 'País não encontrado',
        message: 'Nenhum país corresponde ao termo pesquisado'
      });
    }

    res.json(formatCountry(response.data[0]));
  } catch (error) {
    console.error(error?.response?.data || error.message || error);
    res.status(404).json({ error: 'País não encontrado', details: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    environment: NODE_ENV
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    message: 'A rota solicitada não existe'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
