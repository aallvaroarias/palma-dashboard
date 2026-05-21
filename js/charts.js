if (!window.CHARTS) window.CHARTS = {};

function renderChartRanking(vendedores) {
  destroyChart('chartRanking');

  const vs = [...vendedores].sort((a,b) => (b.venta_neta || 0) - (a.venta_neta || 0));

  CHARTS.ranking = new Chart($('chartRanking'), {
    type: 'bar',
    data: {
      labels: vs.map(v => v.nombre),
      datasets: [{
        label: 'Venta neta',
        data: vs.map(v => v.venta_neta || 0),
        backgroundColor: vs.map((_,i) => VEND_COLORS[i % VEND_COLORS.length] + 'CC'),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => fmt(c.raw) } }
      },
      scales: {
        x: {
          ticks: { callback: fmtK, color: '#94A3B8' },
          grid: { color: 'rgba(148,163,184,.08)' }
        },
        y: {
          ticks: { color: '#94A3B8' },
          grid: { display: false }
        }
      }
    }
  });
}

function renderChartNegocio(resumen) {
  destroyChart('chartNegocio');

  const data = resumen.venta_por_negocio || [];

  CHARTS.negocio = new Chart($('chartNegocio'), {
    type: 'doughnut',
    data: {
      labels: data.map(n => n.negocio),
      datasets: [{
        data: data.map(n => n.venta),
        backgroundColor: data.map(n => (NEG_COLORS[n.negocio] || '#64748B') + 'CC'),
        borderColor: '#121F35',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => `${c.label}: ${fmt(c.raw)}`
          }
        }
      }
    }
  });
}

function renderChartTendencia(tendencia) {
  if (!tendencia.length) return;

  destroyChart('chartTendencia');

  CHARTS.tendencia = new Chart($('chartTendencia'), {
    type: 'bar',
    data: {
      labels: tendencia.map(t => `Sem ${t.semana}`),
      datasets: [{
        label: 'Venta',
        data: tendencia.map(t => t.venta),
        backgroundColor: COLORS.blue + 'CC',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: c => fmt(c.raw) } }
      },
      scales: {
        y: {
          ticks: { callback: fmtK, color: '#94A3B8' }
        },
        x: {
          ticks: { color: '#94A3B8' }
        }
      }
    }
  });
}
