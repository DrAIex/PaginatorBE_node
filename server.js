const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'https://paginator-fe-solid-js.vercel.app', 
  'https://draiex.github.io'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`Запрос с неразрешенного источника: ${origin}`);
      callback(null, true);
    }
  },
  credentials: true
}));

app.use(bodyParser.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const staticPaths = [
  path.join(__dirname, 'public'),
  path.join(__dirname, 'client/dist'),
  path.join(__dirname, 'client', 'dist')
];

staticPaths.forEach(staticPath => {
  if (fs.existsSync(staticPath)) {
    console.log(`Serving static files from: ${staticPath}`);
    app.use(express.static(staticPath));
  }
});

const store = {
  items: Array.from({ length: 1000000 }, (_, i) => ({ 
    id: i + 1, 
    value: `Элемент ${i + 1}` 
  })),
  selectedIds: new Set(),
  customOrder: null
};

const initCustomOrder = () => {
  if (!store.customOrder) {
    console.log('Инициализация customOrder...');
    store.customOrder = store.items.slice(0, 1000).map(item => item.id);
    console.log(`customOrder инициализирован, длина: ${store.customOrder.length}`);
  }
};

initCustomOrder();

app.get('/api/items', (req, res) => {
  console.log('Получение элементов с параметрами:', req.query);
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';

  if (!store.customOrder || !Array.isArray(store.customOrder) || store.customOrder.length === 0) {
    console.log('customOrder не инициализирован или пуст, выполняем инициализацию');
    initCustomOrder();
  }

  let searchResults = store.items;
  if (search) {
    console.log(`Применяем поиск по строке: "${search}"`);
    searchResults = store.items.filter(item => 
      item.value.toLowerCase().includes(search.toLowerCase()) || 
      item.id.toString().includes(search)
    );
    console.log(`Найдено ${searchResults.length} элементов`);
  }

  const searchResultIds = new Set(searchResults.map(item => item.id));
  
  let orderedSearchResults = [];
  
  const visibleItems = page * limit * 2;
  
  const relevantCustomOrder = search 
    ? store.customOrder 
    : store.customOrder.slice(0, Math.min(store.customOrder.length, visibleItems + 1000));
  
  console.log(`Используем ${relevantCustomOrder.length} элементов из customOrder`);
  
  for (const id of relevantCustomOrder) {
    if (searchResultIds.has(id)) {
      const item = store.items.find(item => item.id === id);
      if (item) orderedSearchResults.push(item);
      if (orderedSearchResults.length >= visibleItems) break;
    }
  }
  
  if (search === '' && orderedSearchResults.length >= page * limit) {
    console.log(`Достаточно элементов для текущей страницы (${page}), пропускаем обработку остальных`);
  } 
  else if (orderedSearchResults.length < searchResults.length) {
    console.log('Добавляем элементы, которых нет в customOrder');
    
    if (search === '') {
      const remainingNeeded = (page * limit) - orderedSearchResults.length;
      if (remainingNeeded > 0) {
        const usedIds = new Set(orderedSearchResults.map(item => item.id));
        const remainingItems = store.items
          .filter(item => !usedIds.has(item.id))
          .slice(0, remainingNeeded);
          
        orderedSearchResults = [...orderedSearchResults, ...remainingItems];
      }
    } 
    else {
      const addedIds = new Set(orderedSearchResults.map(item => item.id));
      
      for (const item of searchResults) {
        if (!addedIds.has(item.id)) {
          orderedSearchResults.push(item);
        }
      }
    }
  }

  console.log(`Всего упорядоченных результатов: ${orderedSearchResults.length}`);

  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedResults = orderedSearchResults.slice(startIndex, endIndex);

  console.log(`Отправляем ${paginatedResults.length} элементов для страницы ${page}`);

  const itemsWithSelection = paginatedResults.map(item => ({
    ...item,
    selected: store.selectedIds.has(item.id)
  }));

  res.json({
    items: itemsWithSelection,
    totalItems: orderedSearchResults.length,
    currentPage: page,
    totalPages: Math.ceil(orderedSearchResults.length / limit),
    hasMore: endIndex < orderedSearchResults.length
  });
});

app.post('/api/selection', (req, res) => {
  const { selectedIds } = req.body;
  if (Array.isArray(selectedIds)) {
    store.selectedIds = new Set(selectedIds);
    console.log(`Сохранено ${store.selectedIds.size} выбранных элементов`);
    res.json({ success: true, selectedCount: store.selectedIds.size });
  } else {
    res.status(400).json({ error: 'Неверный формат данных' });
  }
});

app.post('/api/order', (req, res) => {
  const { order, fromId, toId } = req.body;
  console.log('Запрос на сохранение порядка:', { 
    orderLength: order?.length,
    fromId,
    toId
  });
  
  if (fromId && toId) {
    initCustomOrder();
    
    const fromIndex = store.customOrder.indexOf(fromId);
    const toIndex = store.customOrder.indexOf(toId);
    
    console.log(`Перемещение элемента: ${fromId}(индекс ${fromIndex}) -> ${toId}(индекс ${toIndex})`);
    
    if (fromIndex !== -1 && toIndex !== -1) {
      store.customOrder.splice(fromIndex, 1);
      
      const newIndex = fromIndex < toIndex ? toIndex : toIndex;
      
      store.customOrder.splice(newIndex, 0, fromId);
      
      console.log(`Элемент ${fromId} перемещен на позицию ${newIndex}`);
      res.json({ success: true });
    } else {
      console.log('Ошибка: элементы не найдены в customOrder');
      res.status(400).json({ error: 'Элементы не найдены в customOrder' });
    }
  }
  else if (Array.isArray(order) && order.length > 0) {
    console.log(`Сохраняем полный порядок длиной ${order.length}`);
    
    const newOrder = [...order];
    
    if (!store.customOrder || !Array.isArray(store.customOrder)) {
      initCustomOrder();
    }
    
    const orderSet = new Set(newOrder);
    for (const id of store.customOrder) {
      if (!orderSet.has(id)) {
        newOrder.push(id);
      }
    }
    
    store.customOrder = newOrder;
    console.log(`Новый customOrder сохранен, длина: ${store.customOrder.length}`);
    res.json({ success: true });
  } else {
    console.log('Ошибка: неверный формат данных запроса');
    res.status(400).json({ error: 'Неверный формат данных' });
  }
});

app.get('/api/settings', (req, res) => {
  console.log(`Запрос настроек: ${store.selectedIds.size} выбранных элементов, customOrder: ${store.customOrder ? 'инициализирован' : 'не инициализирован'}`);
  
  const limitedCustomOrder = store.customOrder ? store.customOrder.slice(0, 1000) : null;
  
  res.json({
    selectedIds: Array.from(store.selectedIds),
    customOrder: limitedCustomOrder
  });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    for (const staticPath of staticPaths) {
      const indexPath = path.join(staticPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log(`Serving SPA from: ${indexPath}`);
        return res.sendFile(indexPath);
      }
    }
    
    console.log(`Не удалось найти index.html для запроса: ${req.url}`);
    return res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API is available at /api/items and /api/order`);
});

app.get('/api/test', (req, res) => {
  console.log('API test endpoint was called');
  res.json({ message: 'API is working!' });
});

module.exports = app; 