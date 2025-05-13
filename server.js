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
    store.customOrder = store.items.slice(0, 10000).map(item => item.id);
    console.log(`customOrder инициализирован, длина: ${store.customOrder.length}`);
  }
};

const extendCustomOrder = (maxNeededId) => {
  if (!store.customOrder || !Array.isArray(store.customOrder)) {
    initCustomOrder();
    return true;
  }
  
  if (store.customOrder.includes(maxNeededId)) {
    console.log(`Элемент ${maxNeededId} уже есть в customOrder`);
    return false;
  }
  
  let currentMaxId = 0;
  for (const id of store.customOrder) {
    if (id > currentMaxId) {
      currentMaxId = id;
    }
  }
  
  if (maxNeededId <= currentMaxId) {
    return false;
  }
  
  console.log(`Расширяем customOrder с ${currentMaxId} до ${maxNeededId}`);
  
  const chunkSize = 5000;
  let startId = currentMaxId + 1;
  
  while (startId <= maxNeededId) {
    const endId = Math.min(startId + chunkSize - 1, maxNeededId);
    
    const chunkItems = [];
    for (const item of store.items) {
      if (item.id >= startId && item.id <= endId) {
        chunkItems.push(item.id);
      }
      
      if (item.id > endId) {
        break;
      }
    }
    
    console.log(`Добавляем ${chunkItems.length} элементов в customOrder (${startId} - ${endId})`);
    
    store.customOrder = [...store.customOrder, ...chunkItems];
    
    startId = endId + 1;
  }
  
  console.log(`customOrder расширен до ${maxNeededId}, новая длина: ${store.customOrder.length}`);
  return true;
};

app.get('/api/items', (req, res) => {
  console.log('Получение элементов с параметрами:', req.query);
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const noReorder = req.query.noReorder === 'true';

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
  
  const visibleItems = noReorder ? page * limit : page * limit * 2;
  
  const relevantCustomOrder = search || noReorder
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
    hasMore: endIndex < orderedSearchResults.length,
    serverTimestamp: Date.now()
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
  try {
    const { order, fromId, toId } = req.body;
    console.log('Запрос на сохранение порядка:', { 
      orderLength: order?.length,
      fromId,
      toId
    });
    
    if (fromId && toId) {
      initCustomOrder();
      
      const fromItem = store.items.find(item => item.id === fromId);
      const toItem = store.items.find(item => item.id === toId);
      
      if (!fromItem || !toItem) {
        console.log('Ошибка: элементы не найдены в store.items');
        return res.status(400).json({ error: 'Некоторые элементы не найдены' });
      }
      
      try {
        const maxNeededId = Math.max(fromId, toId);
        console.log(`Расширяем customOrder до ${maxNeededId}`);
        const extended = extendCustomOrder(maxNeededId);
        console.log(`Результат расширения: ${extended ? 'расширен' : 'расширение не требуется'}`);
      } catch (error) {
        console.error('Ошибка при расширении customOrder:', error);
        return res.status(500).json({ error: 'Ошибка при обработке запроса: ' + error.message });
      }
      
      const fromIndex = store.customOrder.indexOf(fromId);
      const toIndex = store.customOrder.indexOf(toId);
      
      console.log(`Перемещение элемента: ${fromId}(индекс ${fromIndex}) -> ${toId}(индекс ${toIndex})`);
      
      if (fromIndex !== -1 && toIndex !== -1) {
        store.customOrder.splice(fromIndex, 1);
        
        let newToIndex;
        
        if (fromIndex < toIndex) {
          newToIndex = store.customOrder.indexOf(toId) + 1;
        } else {
          newToIndex = store.customOrder.indexOf(toId);
        }
        
        if (newToIndex === -1) {
          console.log(`Предупреждение: не найден toId=${toId} в customOrder после удаления. Используем резервную логику.`);
          for (let i = 1; i <= 10; i++) {
            const idxForward = store.customOrder.indexOf(toId + i);
            if (idxForward !== -1) {
              newToIndex = idxForward;
              console.log(`Найден альтернативный элемент ${toId + i} на позиции ${newToIndex}`);
              break;
            }
            
            const idxBackward = store.customOrder.indexOf(toId - i);
            if (idxBackward !== -1) {
              newToIndex = idxBackward;
              console.log(`Найден альтернативный элемент ${toId - i} на позиции ${newToIndex}`);
              break;
            }
          }
          
          if (newToIndex === -1) {
            newToIndex = 0;
            console.log(`Не удалось найти альтернативу. Используем позицию 0.`);
          }
        }
        
        store.customOrder.splice(newToIndex, 0, fromId);
        
        console.log(`Элемент ${fromId} перемещен на позицию ${newToIndex} (относительно ${toId})`);
        res.json({ success: true });
      } else {
        console.log('Ошибка: элементы не найдены в customOrder после расширения');
        return res.status(400).json({ 
          error: 'Не удалось найти элементы в customOrder',
          fromIndex,
          toIndex,
          customOrderLength: store.customOrder.length
        });
      }
    }
    else if (Array.isArray(order) && order.length > 0) {
      console.log(`Сохраняем полный порядок длиной ${order.length}`);
      
      const newOrder = [...order];
      
      if (!store.customOrder || !Array.isArray(store.customOrder)) {
        initCustomOrder();
      }
      
      try {
        if (order.length > 0) {
          const maxOrderId = Math.max(...order);
          if (maxOrderId > 0) {
            console.log(`Расширяем customOrder до ${maxOrderId}`);
            extendCustomOrder(maxOrderId);
          }
        }
      } catch (error) {
        console.error('Ошибка при расширении customOrder:', error);
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
  } catch (error) {
    console.error('Ошибка при обработке запроса /api/order:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера: ' + error.message });
  }
});

app.get('/api/settings', (req, res) => {
  console.log(`Запрос настроек: ${store.selectedIds.size} выбранных элементов, customOrder: ${store.customOrder ? 'инициализирован' : 'не инициализирован'}`);
  
  const limitedCustomOrder = store.customOrder 
    ? store.customOrder.slice(0, 5000) 
    : null;
  
  console.log(`Отправляем ${limitedCustomOrder ? limitedCustomOrder.length : 0} элементов customOrder`);
  
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