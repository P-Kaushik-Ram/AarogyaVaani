"""
Intent classifier for AarogyaVaani.

We train one shared classifier across all three languages rather than three
separate models. This works because TF-IDF over character n-grams captures
sub-word patterns that repeat within a language regardless of which script
it is, and a single model is simpler to maintain than three. This is a
genuine trade-off we are making for the prototype stage - documented
honestly rather than claimed as a novel technique.

Dataset: data/train_data.csv - hand-written phrases, ~15-20 examples per
intent per language. This is a small, hand-built dataset, so accuracy
numbers below should be read as prototype-stage, not production-stage.
"""

import csv
import pickle
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import Pipeline

BASE = Path(__file__).resolve().parent.parent
DATA_PATH = BASE / "data" / "train_data.csv"
MODEL_PATH = BASE / "models" / "intent_clf.pkl"


def load_data():
    from pipeline.packs import training
    rows=training()
    return [row['text'] for row in rows],[row['intent'] for row in rows]


def train():
    texts, labels = load_data()
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=1)),
        ("clf", LogisticRegression(max_iter=1000, C=8.0, class_weight="balanced")),
    ])
    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    acc = accuracy_score(y_test, preds)
    report = classification_report(y_test, preds, zero_division=0)

    MODEL_PATH.parent.mkdir(exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(pipeline, f)

    print(f"Training examples: {len(X_train)}   Test examples: {len(X_test)}")
    print(f"Held-out accuracy: {acc:.2f}\n")
    print(report)
    return pipeline, acc


def load_model():
    from pipeline.classify import model
    return model()


def predict_intent(pipeline, text: str) -> str:
    return pipeline.predict([text])[0]


if __name__ == "__main__":
    train()
