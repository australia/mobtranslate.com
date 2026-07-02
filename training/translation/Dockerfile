FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

WORKDIR /workspace/mobtranslate-training

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN python -m pip install --upgrade pip && \
    python -m pip install -r requirements.txt

COPY train_nllb_lora.py evaluate_nllb_lora.py ./

CMD ["/bin/bash"]
