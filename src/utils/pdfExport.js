// Certificate PDF export utility (client-side)
// Generates a printable / downloadable PDF using a hidden print view.

/**
 * Export certificate content as a downloadable PDF.
 * Creates a hidden iframe with print-ready HTML and triggers window.print().
 * The user can save as PDF via the browser print dialog.
 * @param {Object} data
 */
export function exportCertificatePDF(data) {
  const {
    traineeName,
    courseName,
    completionDate,
    certId,
    trainer,
    score,
  } = data

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Certificate ${certId}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Georgia, 'Times New Roman', serif; margin: 0; }
          .page {
            width: 794px; height: 560px; margin: 0 auto;
            border: 3px double #1F5F93;
            padding: 40px; position: relative;
            background: #fff;
            background-image:
              radial-gradient(circle at 10% 10%, #EAF1F8 0, transparent 40%),
              radial-gradient(circle at 90% 90%, #EAF1F8 0, transparent 40%);
          }
          .brand { text-align: center; letter-spacing: 4px; color:#1F5F93; font-size: 18px; font-family: Arial, sans-serif; margin-bottom: 4px;}
          .sub { text-align:center; color:#41566d; font-size:11px; font-family: Arial, sans-serif; letter-spacing:2px;}
          h1 { text-align:center; margin-top: 34px; color:#123a5c; font-size: 26px; letter-spacing: 6px;}
          .cert { text-align:center; margin: 6px 0 24px; color:#4E84B7; font-family:Arial,sans-serif; font-size:12px; letter-spacing:3px;}
          .body { text-align:center; color:#41566d; font-size: 13px; line-height:1.8; font-family: Arial, sans-serif;}
          .name { font-size: 30px; color:#1F5F93; margin: 18px 0 6px; text-align:center; border-bottom:1px solid #DCE6F0; display:inline-block; padding:0 40px 8px;}
          .line { text-align:center;}
          .foot { position:absolute; bottom:34px; left:40px; right:40px; display:flex; justify-content:space-between; color:#123a5c; font-family:Arial,sans-serif; font-size:11px;}
          .meta { text-align:center; margin-top:12px; font-family:Arial,sans-serif; font-size:11px; color:#7C8FA6;}
        </style>
      </head>
      <body>
        <div class="page">
          <div class="brand">CAPACITY CONNECT</div>
          <div class="sub">INDIA METEOROLOGICAL DEPARTMENT &nbsp;•&nbsp; MINISTRY OF EARTH SCIENCES</div>
          <h1>CERTIFICATE</h1>
          <div class="cert">OF SCIENTIFIC CAPACITY &amp; TRAINING READINESS</div>
          <div class="body">This is to certify that</div>
          <div class="line"><span class="name">${traineeName}</span></div>
          <div class="body">has successfully completed the verified training program</div>
          <div class="body" style="font-size:16px; color:#1F5F93; font-weight:bold;">${courseName}</div>
          <div class="body">with a final assessment score of <b>${score}%</b>, demonstrating verified scientific competency and operational readiness.</div>
          <div class="meta">Certificate ID: ${certId} &nbsp;•&nbsp; Issued: ${completionDate} &nbsp;•&nbsp; Trainer: ${trainer}</div>
          <div class="foot">
            <div>
              <div style="border-top:1px solid #41566d; padding-top:4px; width:180px;">Authorized Signatory</div>
            </div>
            <div>
              <div style="border-top:1px solid #41566d; padding-top:4px; width:180px;">Director, Capacity Building</div>
            </div>
          </div>
        </div>
        <script>window.onload = function(){ window.print(); }</script>
      </body>
    </html>
  `

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
}
