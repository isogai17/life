import { useEffect, useRef, useState } from "react";
import {
  Download,
  ImagePlus,
  Images,
  LoaderCircle,
  Maximize2,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import {
  attachImages,
  downloadBlob,
  getImage,
  imageFilename,
  MAX_IMAGES,
  shareImage,
} from "./images.js";

function ImageCard({ image, date, onRemove }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const dialogRef = useRef();
  const returnFocus = useRef();
  useEffect(() => {
    let cancelled = false,
      objectUrl;
    setError("");
    setUrl("");
    getImage(image.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [open]);
  async function share() {
    setSharing(true);
    setError("");
    try {
      await shareImage(date, image);
    } catch (error) {
      setError(error.message);
    } finally {
      setSharing(false);
    }
  }
  async function download() {
    try {
      downloadBlob(await getImage(image.id), imageFilename(date, image));
    } catch (error) {
      setError(error.message);
    }
  }
  function openPreview(event) {
    returnFocus.current = event.currentTarget;
    setOpen(true);
  }
  const size =
    image.size >= 1024 * 1024
      ? `${(image.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(image.size / 1024))} KB`;
  return (
    <article className="sleep-image-card">
      <button
        type="button"
        className="sleep-thumbnail"
        disabled={!url}
        onClick={openPreview}
        aria-label={`${image.name}を拡大`}
      >
        {url ? (
          <img src={url} alt={`睡眠記録：${image.name}`} loading="lazy" />
        ) : (
          <Images size={26} />
        )}
        {url && (
          <span>
            <Maximize2 size={14} />
            拡大する
          </span>
        )}
      </button>
      <div className="sleep-image-info">
        <p title={image.name}>{image.name}</p>
        <small>
          {image.width} × {image.height} · {size} · 原本
        </small>
      </div>
      <div className="sleep-image-actions">
        <button
          type="button"
          disabled={!url || sharing}
          onClick={share}
          aria-label={`${image.name}を共有・保存`}
        >
          <Share2 size={14} />
          共有・保存
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${image.name}を添付から外す`}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {error && (
        <p className="image-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <div
          className="modal-overlay image-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="image-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`睡眠画像：${image.name}`}
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Tab") {
                const buttons = [
                  ...event.currentTarget.querySelectorAll(
                    "button:not(:disabled)",
                  ),
                ];
                const first = buttons[0],
                  last = buttons.at(-1);
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === event.currentTarget)
                ) {
                  event.preventDefault();
                  last.focus();
                } else if (
                  !event.shiftKey &&
                  (document.activeElement === last ||
                    document.activeElement === event.currentTarget)
                ) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <div className="image-dialog-header">
              <span>{date} の睡眠記録</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="画像を閉じる"
              >
                <X size={21} />
              </button>
            </div>
            <img src={url} alt={`睡眠記録の原本：${image.name}`} />
            <div className="image-dialog-footer">
              <span>{image.name}</span>
              <button
                className="button secondary"
                type="button"
                onClick={download}
              >
                <Download size={16} />
                画像を保存
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}

export function SleepImageGallery({ images = [], date, onRemove }) {
  if (!images.length) return null;
  return (
    <div className="sleep-image-gallery">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          date={date}
          onRemove={onRemove ? () => onRemove(image.id) : undefined}
        />
      ))}
    </div>
  );
}

export default function SleepImages({
  images = [],
  date,
  onChange,
  busy,
  onBusyChange,
}) {
  const [error, setError] = useState("");
  const inputRef = useRef();
  async function selectFiles(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length || busy) return;
    setError("");
    onBusyChange(true);
    try {
      onChange(await attachImages(files, images));
    } catch (error) {
      setError(error.message);
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <section className="card sleep-attachments">
      <div className="section-heading">
        <span className="section-icon lavender">
          <Images size={19} />
        </span>
        <div>
          <h2>睡眠の記録を、そのまま</h2>
          <p>グラフも細かな数値も、画像で残そう。</p>
        </div>
        <span className="optional">任意</span>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        id="sleep-images"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={selectFiles}
        disabled={busy || images.length >= MAX_IMAGES}
        aria-label="睡眠画像を追加"
        aria-describedby="sleep-image-help"
      />
      <button
        className="image-upload"
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || images.length >= MAX_IMAGES}
      >
        {busy ? (
          <LoaderCircle className="spin" size={23} />
        ) : (
          <ImagePlus size={24} />
        )}
        <span>
          {busy
            ? "画像を保存しています…"
            : images.length >= MAX_IMAGES
              ? "3枚の画像を添付済みです"
              : "睡眠画像を追加する"}
          <small>
            {busy
              ? "このまま少しお待ちください"
              : "写真ライブラリ・ファイルから選択"}
          </small>
        </span>
        <span className="image-count">
          {images.length} / {MAX_IMAGES}
        </span>
      </button>
      <p className="attachment-help" id="sleep-image-help">
        PNG・JPEG・WebP ／ 1枚10MBまで。画像は加工せず原本で保存します。
      </p>
      {error && (
        <p className="image-error" role="alert">
          {error}
        </p>
      )}
      <SleepImageGallery
        images={images}
        date={date}
        onRemove={
          busy
            ? undefined
            : (id) => onChange(images.filter((image) => image.id !== id))
        }
      />
      {images.length > 0 && (
        <div className="image-handoff">
          <Share2 size={16} />
          <p>
            <strong>ChatGPTには、日記と画像を一緒に。</strong>
            「ChatGPT用にコピー」で本文を貼り付け、画像も別途添付してください。「共有・保存」から画像を取り出せます。画像の数値は自動入力されません。
          </p>
        </div>
      )}
    </section>
  );
}
