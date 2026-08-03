const readFileAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    rows.push(row);
  }

  return rows.filter((line) => line.some((cell) => cell.trim() !== ''));
};

const parseImportedData = (text, fileName, type) => {
  const normalizedName = fileName?.toLowerCase() || '';
  if (normalizedName.endsWith('.json')) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;

    const containerKeys = type === 'customer'
      ? ['clientes', 'customers', 'clients', 'data', 'rows', 'items']
      : type === 'order'
        ? ['pedidos', 'orders', 'data', 'rows', 'items']
        : ['vendedores', 'sellers', 'data', 'rows', 'items'];

    for (const key of containerKeys) {
      if (Array.isArray(parsed?.[key])) return parsed[key];
    }

    return [];
  }

  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.toLowerCase());
  return rows.slice(1).filter((row) => row.some((cell) => cell.trim() !== '')).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || '';
    });
    return record;
  });
};

const getFieldValue = (record, candidates) => {
  const source = record && typeof record === 'object' ? record : {};
  for (const candidate of candidates) {
    const value = source[candidate];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const parseNumber = (value) => {
  const cleaned = String(value ?? '').replace(/[R$\.\s]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const downloadTemplate = (fileName, content) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const mapCustomerRecord = (record) => ({
  name: String(getFieldValue(record, ['name', 'nome', 'cliente', 'customer', 'client', 'titulo']) || '').trim(),
  segment: String(getFieldValue(record, ['segment', 'segmento', 'categoria', 'tipo']) || '').trim(),
  status: String(getFieldValue(record, ['status', 'situacao', 'situação', 'estado']) || 'Novo').trim(),
  value: parseNumber(getFieldValue(record, ['value', 'valor', 'valor_estimado', 'estimated_value', 'amount'])),
});

const mapOrderRecord = (record) => ({
  number: String(getFieldValue(record, ['number', 'numero', 'pedido', 'id', 'order']) || '').trim(),
  customer: String(getFieldValue(record, ['customer', 'cliente', 'client', 'nome']) || '').trim(),
  value: parseNumber(getFieldValue(record, ['value', 'valor', 'amount', 'total'])),
  status: String(getFieldValue(record, ['status', 'situacao', 'estado']) || 'Pendente').trim(),
});

const mapSellerRecord = (record) => ({
  name: String(getFieldValue(record, ['name', 'nome', 'seller', 'vendedor']) || '').trim(),
  email: String(getFieldValue(record, ['email', 'e-mail', 'mail']) || '').trim(),
  password: String(getFieldValue(record, ['password', 'senha']) || '').trim(),
  role: 'vendedor',
});

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('lead-form');
  const status = document.getElementById('form-status');
  const faqItems = document.querySelectorAll('.faq-list details');

  if (form && status) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = data.get('name')?.toString().trim() || 'cliente';
      status.textContent = `Obrigado, ${name}! Sua solicitação foi recebida. Nossa equipe entrará em contato em breve.`;
      form.reset();
    });
  }

  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      faqItems.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });

  const authForm = document.getElementById('auth-form');
  const authStatus = document.getElementById('auth-status');
  const nameFieldWrapper = document.querySelector('#name-field-wrapper');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const currentPage = document.body.dataset.page;

  if (authForm && authStatus) {
    let mode = 'login';

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        mode = button.dataset.mode;
        tabButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
        const isRegister = mode === 'register';
        if (nameFieldWrapper) {
          nameFieldWrapper.classList.toggle('hidden', !isRegister);
        }
        authStatus.textContent = '';
        authForm.querySelector('button').textContent = isRegister ? 'Criar conta' : 'Entrar';
      });
    });

    authForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(authForm);
      const email = data.get('email')?.toString().trim();
      const password = data.get('password')?.toString();
      const name = data.get('name')?.toString().trim() || 'Usuário';
      const role = data.get('role')?.toString() || 'vendedor';

      if (!email || !password) return;

      if (mode === 'register') {
        localStorage.setItem('nexovendas-user', JSON.stringify({ name, email, role }));
        authStatus.textContent = 'Conta criada com sucesso! Faça login agora.';
        mode = 'login';
        tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === 'login'));
        if (nameFieldWrapper) nameFieldWrapper.classList.add('hidden');
        authForm.reset();
        authForm.querySelector('button').textContent = 'Entrar';
        return;
      }

      const user = JSON.parse(localStorage.getItem('nexovendas-user') || 'null');
      if (user?.email === email && user?.role === role) {
        localStorage.setItem('nexovendas-session', 'active');
        localStorage.setItem('nexovendas-role', role);
        window.location.href = 'dashboard.html';
      } else {
        authStatus.textContent = 'Usuário não encontrado ou perfil incorreto.';
      }
    });
  }

  if (currentPage === 'dashboard' || currentPage === 'clientes' || currentPage === 'pedidos' || currentPage === 'estoque' || currentPage === 'vendedores') {
    const session = localStorage.getItem('nexovendas-session');
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    const user = JSON.parse(localStorage.getItem('nexovendas-user') || '{"name":"Usuário","email":"demo@nexovendas.com","role":"admin"}');
    const role = localStorage.getItem('nexovendas-role') || user.role || 'vendedor';
    const userName = document.getElementById('user-name');
    if (userName) userName.textContent = `${user.name} (${role === 'admin' ? 'Administrador' : 'Vendedor'})`;

    document.querySelectorAll('.sidebar-nav a[data-module]').forEach((link) => {
      const module = link.dataset.module;
      const allowedForAdmin = ['clientes','pedidos','estoque'];
      const allowedForSeller = ['clientes','pedidos'];
      const allowedModules = role === 'admin' ? allowedForAdmin : allowedForSeller;
      if (!allowedModules.includes(module)) {
        link.style.display = 'none';
      }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('nexovendas-session');
        window.location.href = 'login.html';
      });
    }

    const ordersList = document.getElementById('recent-orders');
    if (ordersList) {
      const orders = JSON.parse(localStorage.getItem('nexovendas-orders') || '[]');
      if (orders.length) {
        ordersList.innerHTML = orders.map((order) => `<li>Pedido ${order.number} • Cliente ${order.customer} • ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.value)}</li>`).join('');
      } else {
        ordersList.innerHTML = '<li>Nenhum pedido cadastrado ainda.</li>';
      }
    }

    if (role === 'vendedor') {
      const estoqueLink = document.querySelector('.sidebar-nav a[data-module="estoque"]');
      if (estoqueLink) estoqueLink.style.display = 'none';
    }

    if (role === 'admin') {
      const sellerLink = document.querySelector('.sidebar-nav a[data-module="vendedores"]');
      if (sellerLink) sellerLink.style.display = 'block';
    }

    const customerTableBody = document.getElementById('customer-table-body');
    if (customerTableBody) {
      const customers = JSON.parse(localStorage.getItem('nexovendas-customers') || '[]');
      customerTableBody.innerHTML = customers.length
        ? customers.map((customer) => `<tr><td>${customer.name}</td><td>${customer.segment}</td><td>${customer.status}</td><td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.value)}</td></tr>`).join('')
        : '<tr><td colspan="4">Nenhum cliente cadastrado.</td></tr>';
    }

    const customerImportForm = document.getElementById('customer-import-form');
    const customerImportStatus = document.getElementById('customer-import-status');
    const customerTemplateButton = document.getElementById('customer-download-template');
    if (customerTemplateButton) {
      customerTemplateButton.addEventListener('click', () => {
        downloadTemplate('modelo-clientes.csv', 'nome,segmento,status,valor\nMaria Silva,Saúde,Novo,1250\nJosé Pereira,Indústria,Em negociação,5400\n');
      });
    }
    if (customerImportForm && customerImportStatus) {
      customerImportForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fileInput = document.getElementById('customer-import-file');
        const replaceInput = document.getElementById('customer-replace-data');
        const file = fileInput?.files?.[0];

        if (!file) {
          customerImportStatus.textContent = 'Selecione um arquivo para importar.';
          return;
        }

        try {
          const text = await readFileAsText(file);
          const records = parseImportedData(text, file.name, 'customer');
          const importedCustomers = records.map(mapCustomerRecord).filter((customer) => customer.name);
          const customers = JSON.parse(localStorage.getItem('nexovendas-customers') || '[]');
          const merged = replaceInput?.checked ? importedCustomers : [...customers, ...importedCustomers];
          localStorage.setItem('nexovendas-customers', JSON.stringify(merged));
          customerImportStatus.textContent = `${importedCustomers.length} cliente(s) importado(s) com sucesso.`;
          if (customerTableBody) {
            customerTableBody.innerHTML = merged.length
              ? merged.map((customer) => `<tr><td>${customer.name}</td><td>${customer.segment}</td><td>${customer.status}</td><td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.value)}</td></tr>`).join('')
              : '<tr><td colspan="4">Nenhum cliente cadastrado.</td></tr>';
          }
          customerImportForm.reset();
        } catch (error) {
          customerImportStatus.textContent = 'Não foi possível importar o arquivo. Verifique o formato.';
        }
      });
    }

    const customerForm = document.getElementById('customer-form');
    const customerStatus = document.getElementById('customer-status');
    if (customerForm && customerStatus) {
      customerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(customerForm);
        const customer = {
          name: data.get('name')?.toString().trim(),
          segment: data.get('segment')?.toString().trim(),
          status: data.get('status')?.toString().trim(),
          value: Number(data.get('value')) || 0,
        };
        const customers = JSON.parse(localStorage.getItem('nexovendas-customers') || '[]');
        customers.push(customer);
        localStorage.setItem('nexovendas-customers', JSON.stringify(customers));
        customerStatus.textContent = 'Cliente cadastrado com sucesso.';
        customerForm.reset();
        if (customerTableBody) {
          customerTableBody.innerHTML = customers.map((item) => `<tr><td>${item.name}</td><td>${item.segment}</td><td>${item.status}</td><td>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}</td></tr>`).join('');
        }
      });
    }

    let renderOrders = null;

    const orderForm = document.getElementById('order-form');
    const orderStatus = document.getElementById('order-status');
    const ordersListContainer = document.getElementById('orders-list');
    if (orderForm && orderStatus && ordersListContainer) {
      renderOrders = () => {
        const orders = JSON.parse(localStorage.getItem('nexovendas-orders') || '[]');
        ordersListContainer.innerHTML = orders.length
          ? orders.map((order) => `
              <article class="summary-card">
                <h3>Pedido ${order.number}</h3>
                <p>Cliente: ${order.customer}</p>
                <p>Status: ${order.status}</p>
                <strong>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.value)}</strong>
                ${role === 'admin' ? `<button class="btn btn-secondary small" data-approve="${order.number}">Aprovar</button>` : ''}
              </article>
            `).join('')
          : '<p>Nenhum pedido cadastrado.</p>';

        ordersListContainer.querySelectorAll('[data-approve]').forEach((button) => {
          button.addEventListener('click', () => {
            const number = button.getAttribute('data-approve');
            const ordersData = JSON.parse(localStorage.getItem('nexovendas-orders') || '[]');
            const updated = ordersData.map((order) => (order.number === number ? { ...order, status: 'Aprovado' } : order));
            localStorage.setItem('nexovendas-orders', JSON.stringify(updated));
            renderOrders();
          });
        });
      };

      orderForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(orderForm);
        const order = {
          number: data.get('number')?.toString().trim(),
          customer: data.get('customer')?.toString().trim(),
          value: Number(data.get('value')) || 0,
          status: data.get('status')?.toString().trim() || 'Pendente',
        };
        const orders = JSON.parse(localStorage.getItem('nexovendas-orders') || '[]');
        orders.push(order);
        localStorage.setItem('nexovendas-orders', JSON.stringify(orders));
        orderStatus.textContent = 'Pedido salvo com sucesso.';
        orderForm.reset();
        renderOrders();
      });

      renderOrders();
    }

    const orderImportForm = document.getElementById('order-import-form');
    const orderImportStatus = document.getElementById('order-import-status');
    const orderTemplateButton = document.getElementById('order-download-template');
    if (orderTemplateButton) {
      orderTemplateButton.addEventListener('click', () => {
        downloadTemplate('modelo-pedidos.csv', 'numero,cliente,valor,status\n1001,Maria Silva,1250,Pendente\n1002,José Pereira,5400,Aprovado\n');
      });
    }
    if (orderImportForm && orderImportStatus && renderOrders) {
      orderImportForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fileInput = document.getElementById('order-import-file');
        const replaceInput = document.getElementById('order-replace-data');
        const file = fileInput?.files?.[0];

        if (!file) {
          orderImportStatus.textContent = 'Selecione um arquivo para importar.';
          return;
        }

        try {
          const text = await readFileAsText(file);
          const records = parseImportedData(text, file.name, 'order');
          const importedOrders = records.map(mapOrderRecord).filter((order) => order.number && order.customer);
          const orders = JSON.parse(localStorage.getItem('nexovendas-orders') || '[]');
          const merged = replaceInput?.checked ? importedOrders : [...orders, ...importedOrders];
          localStorage.setItem('nexovendas-orders', JSON.stringify(merged));
          orderImportStatus.textContent = `${importedOrders.length} pedido(s) importado(s) com sucesso.`;
          renderOrders();
          orderImportForm.reset();
        } catch (error) {
          orderImportStatus.textContent = 'Não foi possível importar o arquivo. Verifique o formato.';
        }
      });
    }

    const sellerForm = document.getElementById('seller-form');
    const sellerStatus = document.getElementById('seller-status');
    const sellerTableBody = document.getElementById('seller-table-body');
    if (role === 'admin' && sellerForm && sellerStatus && sellerTableBody) {
      const renderSellers = () => {
        const sellers = JSON.parse(localStorage.getItem('nexovendas-sellers') || '[]');
        sellerTableBody.innerHTML = sellers.length
          ? sellers.map((seller) => `<tr><td>${seller.name}</td><td>${seller.email}</td><td>${seller.role}</td></tr>`).join('')
          : '<tr><td colspan="3">Nenhum vendedor cadastrado.</td></tr>';
      };

      sellerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(sellerForm);
        const seller = {
          name: data.get('name')?.toString().trim(),
          email: data.get('email')?.toString().trim(),
          password: data.get('password')?.toString(),
          role: 'vendedor',
        };
        const sellers = JSON.parse(localStorage.getItem('nexovendas-sellers') || '[]');
        sellers.push(seller);
        localStorage.setItem('nexovendas-sellers', JSON.stringify(sellers));
        sellerStatus.textContent = 'Vendedor cadastrado com sucesso.';
        sellerForm.reset();
        renderSellers();
      });

      const sellerImportForm = document.getElementById('seller-import-form');
      const sellerImportStatus = document.getElementById('seller-import-status');
      const sellerTemplateButton = document.getElementById('seller-download-template');
      if (sellerTemplateButton) {
        sellerTemplateButton.addEventListener('click', () => {
          downloadTemplate('modelo-vendedores.csv', 'nome,email,senha\nAna Souza,ana@empresa.com,123456\nCarlos Lima,carlos@empresa.com,654321\n');
        });
      }
      if (sellerImportForm && sellerImportStatus) {
        sellerImportForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const fileInput = document.getElementById('seller-import-file');
          const replaceInput = document.getElementById('seller-replace-data');
          const file = fileInput?.files?.[0];

          if (!file) {
            sellerImportStatus.textContent = 'Selecione um arquivo para importar.';
            return;
          }

          try {
            const text = await readFileAsText(file);
            const records = parseImportedData(text, file.name, 'seller');
            const importedSellers = records.map(mapSellerRecord).filter((seller) => seller.name && seller.email);
            const sellers = JSON.parse(localStorage.getItem('nexovendas-sellers') || '[]');
            const merged = replaceInput?.checked ? importedSellers : [...sellers, ...importedSellers];
            localStorage.setItem('nexovendas-sellers', JSON.stringify(merged));
            sellerImportStatus.textContent = `${importedSellers.length} vendedor(es) importado(s) com sucesso.`;
            renderSellers();
            sellerImportForm.reset();
          } catch (error) {
            sellerImportStatus.textContent = 'Não foi possível importar o arquivo. Verifique o formato.';
          }
        });
      }

      renderSellers();
    }
  }
});
