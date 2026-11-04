from functools import lru_cache
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from pipeline.packs import training

def make_model():
    return Pipeline([('tfidf',TfidfVectorizer(analyzer='char_wb',ngram_range=(2,5))),('clf',LogisticRegression(max_iter=1000,C=8.0,class_weight='balanced',random_state=42))])

@lru_cache
def model():
    # P13 packs use deterministic commands. Keep the legacy model's training
    # boundary unchanged so new synthetic rows cannot expand CLI auto-commit.
    rows=[row for row in training() if row['language'] in ('en','hi','ta')]
    return make_model().fit([r['text'] for r in rows],[r['intent'] for r in rows])

def classify(text):
    probabilities=model().predict_proba([text])[0]
    index=int(probabilities.argmax())
    return str(model().classes_[index]),float(probabilities[index])
