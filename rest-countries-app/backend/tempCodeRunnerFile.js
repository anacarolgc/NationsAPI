require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cache = require('memory-cache');

const app = express();

// Configurações de Segurança 
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());

// Cache 
const memCache = new cache.Cache();
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = '__express__' + req.originalUrl;
    const cachedContent = memCache.get(key);
    
    if (cachedContent) {
      res.send(cachedContent);
      return;
    } else {
      res.sendResponse = res.send;
      res.send = (body) => {
        memCache.put(key, body, duration * 1000);
        res.sendResponse(body);
      };
      next();
    }
  };
};

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});
app.use(limiter);

const PORT = process.env.PORT || 3001;
const COUNTRIES_API = 'https://restcountries.com/v3.1';

// Validação de erros da API
const handleApiError = (error, res) => {
  console.error('Erro na API:', error.message);
  
  if (error.response) {
    return res.status(error.response.status).json({ 
      error: 'Erro na API externa',
      details: error.response.data 
    });
  } else if (error.request) {
    return res.status(503).json({ 
      error: 'Serviço indisponível', 
      message: 'A API de países não respondeu' 
    });
  } else {
    return res.status(500).json({ 
      error: 'Erro interno no servidor' 
    });
  }
};

// Lista todos os países 
app.get('/api/countries', cacheMiddleware(300), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const response = await axios.get(`${COUNTRIES_API}/all`);
    
    let countries = response.data;
    
    // Filtro por nome
    if (search) {
      countries = countries.filter(country => 
        country.name.common.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Paginação
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedCountries = countries.slice(startIndex, endIndex);
    
    res.json({
      total: countries.length,
      page: parseInt(page),
      totalPages: Math.ceil(countries.length / limit),
      data: paginatedCountries
    });
    
  } catch (error) {
    handleApiError(error, res);
  }
});

// Detalhes de um país específico
app.get('/api/countries/:name', cacheMiddleware(300), async (req, res) => {
  try {
    const { name } = req.params;
    const { fields } = req.query;
    
    const response = await axios.get(`${COUNTRIES_API}/name/${name}`);
    let countryData = response.data[0];
    
    // Filtro de campos 
    if (fields) {
      const fieldList = fields.split(',');
      const filteredData = {};
      
      fieldList.forEach(field => {
        if (countryData[field]) {
          filteredData[field] = countryData[field];
        }
      });
      
      countryData = filteredData;
    }
    
    res.json(countryData);
  } catch (error) {
    handleApiError(error, res);
  }
});

// Rota de saúde do servidor
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'online', 
    timestamp: new Date().toISOString() 
  });
});

// Manipulador de rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint não encontrado',
    availableEndpoints: [
      'GET /api/countries',
      'GET /api/countries/:name',
      'GET /api/health'
    ]
  });
});

// Error handling global
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.stack);
  res.status(500).json({ 
    error: 'Erro interno no servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});